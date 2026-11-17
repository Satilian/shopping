import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { DatabaseService } from './database.service';

const sessionCookie = 'shopping_session';
const flowCookie = 'shopping_oidc';
const sessionAge = 60 * 60 * 24;

function cookie(request: FastifyRequest, name: string): string | undefined {
  return request.headers.cookie
    ?.split(/;\s*/)
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private client?: oidc.Configuration;

  constructor(private readonly db: DatabaseService) {}

  get origin(): string {
    const url = process.env.PUBLIC_URL;
    if (!url) throw new ServiceUnavailableException('Public URL is not configured');
    return new URL(url).origin;
  }

  async configuration(): Promise<oidc.Configuration> {
    const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = process.env;
    if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
      throw new ServiceUnavailableException('OIDC is not configured');
    }
    this.client ??= await oidc.discovery(new URL(OIDC_ISSUER), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET);
    return this.client;
  }

  setCookie(name: string, value: string, age: number): string {
    const secure = this.origin.startsWith('https:') ? '; Secure' : '';
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
  }

  assertOrigin(request: FastifyRequest): void {
    if (request.headers.origin !== this.origin) throw new ForbiddenException('Invalid request origin');
  }

  async user(request: FastifyRequest): Promise<{ id: string; name: string }> {
    const token = cookie(request, sessionCookie);
    if (!token) throw new UnauthorizedException();
    const result = await this.db.connection.query<{ id: string; name: string }>(
      `SELECT u.id, u.display_name AS name FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hash(token)],
    );
    if (!result.rows[0]) throw new UnauthorizedException();
    return result.rows[0];
  }

  async createSession(claims: oidc.IDToken): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.connection.query(
      `WITH account AS (
         INSERT INTO app_users (issuer, subject, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (issuer, subject) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id
       )
       INSERT INTO app_sessions (token_hash, user_id, expires_at)
       SELECT $4, id, now() + $5 * interval '1 second' FROM account`,
      [claims.iss, claims.sub, claims.name ?? claims.preferred_username ?? claims.sub, hash(token), sessionAge],
    );
    return token;
  }

  async endSession(request: FastifyRequest): Promise<void> {
    const token = cookie(request, sessionCookie);
    if (token) await this.db.connection.query('DELETE FROM app_sessions WHERE token_hash = $1', [hash(token)]);
  }
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login')
  async login(@Res() reply: FastifyReply): Promise<void> {
    const config = await this.auth.configuration();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: new URL('/api/auth/callback', this.auth.origin).href,
      scope: 'openid profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
    });
    reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', this.auth.setCookie(flowCookie, `${state}.${verifier}`, 600))
      .redirect(url.href);
  }

  @Get('callback')
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const [state, verifier] = cookie(request, flowCookie)?.split('.') ?? [];
    reply.header('Cache-Control', 'no-store').header('Set-Cookie', this.auth.setCookie(flowCookie, '', 0));
    if (!state || !verifier) throw new UnauthorizedException('Login session expired');
    const config = await this.auth.configuration();
    const url = new URL('/api/auth/callback', this.auth.origin);
    url.search = new URL(request.url, this.auth.origin).search;
    const tokens = await oidc.authorizationCodeGrant(config, url, {
      expectedState: state,
      pkceCodeVerifier: verifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims) throw new UnauthorizedException('Missing identity token');
    const token = await this.auth.createSession(claims);
    reply.header('Set-Cookie', this.auth.setCookie(sessionCookie, token, sessionAge)).redirect('/');
  }

  @Get('session')
  async session(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    if (!process.env.OIDC_ISSUER) return { mode: 'local' };
    return this.auth.user(request);
  }

  @Post('logout')
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    this.auth.assertOrigin(request);
    await this.auth.endSession(request);
    reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', this.auth.setCookie(sessionCookie, '', 0))
      .code(204)
      .send();
  }
}
