import { Controller, Get, Header, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const template = readFileSync(join(__dirname, '../../client/index.html'), 'utf8');
const { render }: typeof import('../render') = createRequire(__filename)('../../render/index.js');

@Controller()
export class AppController {
  @Get(['/', '/shopping'])
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(@Req() request: FastifyRequest): string {
    return template.replace('<div id="root"></div>', () => `<div id="root">${render(request.url.split('?')[0])}</div>`);
  }

  @Get('api/health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
