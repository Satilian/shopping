import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { AuthService } from './auth.controller';
import { DatabaseService } from './database.service';

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Controller('api')
export class InvitationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DatabaseService,
  ) {}

  @Post('groups/:groupId/invitations')
  async create(@Req() request: FastifyRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const token = randomBytes(32).toString('base64url');
    const result = await this.db.connection.query(
      `INSERT INTO group_invitations (token_hash, group_id, expires_at)
       SELECT $3, id, now() + interval '24 hours' FROM shopping_groups WHERE id = $1 AND owner_id = $2
       RETURNING expires_at AS "expiresAt"`,
      [groupId, user.id, digest(token)],
    );
    if (!result.rowCount) throw new NotFoundException();
    return { token, ...result.rows[0] };
  }

  @Delete('groups/:groupId/invitations/:token')
  @HttpCode(204)
  async revoke(
    @Req() request: FastifyRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('token') token: string,
  ) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `UPDATE group_invitations i SET revoked_at = now() FROM shopping_groups g
       WHERE i.group_id = g.id AND g.id = $1 AND g.owner_id = $2 AND i.token_hash = $3
       AND i.redeemed_at IS NULL`,
      [groupId, user.id, digest(token)],
    );
    if (!result.rowCount) throw new NotFoundException();
  }

  @Post('invitations/:token/accept')
  @HttpCode(204)
  async accept(@Req() request: FastifyRequest, @Param('token') token: string) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `WITH redeemed AS (
         UPDATE group_invitations i SET redeemed_at = now()
         WHERE i.token_hash = $1 AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
         AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = i.group_id AND m.user_id = $2)
         RETURNING i.group_id
       )
       INSERT INTO group_members (group_id, user_id) SELECT group_id, $2 FROM redeemed`,
      [digest(token), user.id],
    );
    if (!result.rowCount) throw new NotFoundException();
  }

  @Get('groups/:groupId/members')
  async members(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `SELECT u.id, u.display_name AS name, u.id = g.owner_id AS "isOwner"
       FROM shopping_groups g JOIN group_members m ON m.group_id = g.id JOIN app_users u ON u.id = m.user_id
       WHERE g.id = $1 AND g.owner_id = $2 ORDER BY "isOwner" DESC, name, u.id`,
      [groupId, user.id],
    );
    if (!result.rowCount) throw new NotFoundException();
    return result.rows;
  }

  @Delete('groups/:groupId/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Req() request: FastifyRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `DELETE FROM group_members m USING shopping_groups g
       WHERE m.group_id = g.id AND g.id = $1 AND g.owner_id = $2 AND m.user_id = $3 AND m.user_id <> g.owner_id`,
      [groupId, user.id, userId],
    );
    if (!result.rowCount) throw new NotFoundException();
  }
}
