import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.controller';
import { DatabaseService } from './database.service';

function nameFrom(body: unknown): string {
  const name =
    body && typeof body === 'object' && 'name' in body && typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100 || name.includes('\0')) throw new BadRequestException('Invalid name');
  return name;
}

@Controller('api/groups')
export class GroupsController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DatabaseService,
  ) {}

  @Post('import')
  @HttpCode(204)
  async importLocal(@Req() request: FastifyRequest, @Body() body: unknown): Promise<void> {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    if (!Array.isArray(body)) throw new BadRequestException('Invalid groups');
    const groups = body.map((group: unknown) => {
      if (
        !group ||
        typeof group !== 'object' ||
        !('id' in group) ||
        typeof group.id !== 'string' ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(group.id) ||
        !('items' in group) ||
        !Array.isArray(group.items)
      ) {
        throw new BadRequestException('Invalid local group');
      }
      const items = group.items.map((item: unknown) => {
        if (!item || typeof item !== 'object' || !('needed' in item) || typeof item.needed !== 'boolean') {
          throw new BadRequestException('Invalid local item');
        }
        return { name: nameFrom(item), needed: item.needed };
      });
      return { id: group.id, name: nameFrom(group), items };
    });
    await this.db.connection.query(
      `WITH source AS (
         SELECT DISTINCT ON (id) id, name, items
         FROM jsonb_to_recordset($2::jsonb) AS data(id uuid, name text, items jsonb)
       ), created AS (
         INSERT INTO shopping_groups (owner_id, imported_id, name)
         SELECT $1, id, name FROM source ON CONFLICT (owner_id, imported_id) DO NOTHING
         RETURNING id, imported_id
       ), memberships AS (
         INSERT INTO group_members (group_id, user_id) SELECT id, $1 FROM created
       )
       INSERT INTO shopping_items (group_id, name, needed)
       SELECT created.id, item.name, item.needed FROM created JOIN source ON source.id = created.imported_id
       CROSS JOIN LATERAL jsonb_to_recordset(source.items) AS item(name text, needed boolean)`,
      [user.id, JSON.stringify(groups)],
    );
  }

  @Get()
  async list(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `SELECT g.id, g.name, g.owner_id = $1 AS "isOwner",
         COALESCE((SELECT json_agg(json_build_object('id', i.id, 'name', i.name, 'needed', i.needed)
           ORDER BY i.created_at, i.id) FROM shopping_items i WHERE i.group_id = g.id), '[]') AS items
       FROM group_members m JOIN shopping_groups g ON g.id = m.group_id
       WHERE m.user_id = $1 ORDER BY g.created_at, g.id`,
      [user.id],
    );
    return result.rows;
  }

  @Post()
  async create(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `WITH created AS (
         INSERT INTO shopping_groups (name, owner_id) VALUES ($1, $2) RETURNING id, name
       ), membership AS (
         INSERT INTO group_members (group_id, user_id) SELECT id, $2 FROM created
       )
       SELECT id, name FROM created`,
      [nameFrom(body), user.id],
    );
    return result.rows[0];
  }

  @Delete(':groupId')
  @HttpCode(204)
  async remove(@Req() request: FastifyRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query('DELETE FROM shopping_groups WHERE id = $1 AND owner_id = $2', [
      groupId,
      user.id,
    ]);
    if (!result.rowCount) throw new NotFoundException();
  }

  @Post(':groupId/items')
  async addItem(
    @Req() request: FastifyRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `INSERT INTO shopping_items (group_id, name)
       SELECT group_id, $3 FROM group_members WHERE group_id = $1 AND user_id = $2
       RETURNING id, name, needed`,
      [groupId, user.id, nameFrom(body)],
    );
    if (!result.rowCount) throw new NotFoundException();
    return result.rows[0];
  }

  @Patch(':groupId/items/:itemId')
  @HttpCode(204)
  async markItem(
    @Req() request: FastifyRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    if (!body || typeof body !== 'object' || !('needed' in body) || typeof body.needed !== 'boolean') {
      throw new BadRequestException('Invalid needed value');
    }
    const result = await this.db.connection.query(
      `UPDATE shopping_items i SET needed = $4 FROM group_members m
       WHERE i.id = $1 AND i.group_id = $2 AND m.group_id = i.group_id AND m.user_id = $3`,
      [itemId, groupId, user.id, body.needed],
    );
    if (!result.rowCount) throw new NotFoundException();
  }

  @Delete(':groupId/items/:itemId')
  @HttpCode(204)
  async removeItem(
    @Req() request: FastifyRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    this.auth.assertOrigin(request);
    const user = await this.auth.user(request);
    const result = await this.db.connection.query(
      `DELETE FROM shopping_items i USING group_members m
       WHERE i.id = $1 AND i.group_id = $2 AND m.group_id = i.group_id AND m.user_id = $3`,
      [itemId, groupId, user.id],
    );
    if (!result.rowCount) throw new NotFoundException();
  }
}
