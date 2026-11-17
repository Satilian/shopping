import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthController, AuthService } from './auth.controller';
import { DatabaseService } from './database.service';
import { GroupsController } from './groups.controller';
import { InvitationsController } from './invitations.controller';

@Module({
  controllers: [AppController, AuthController, GroupsController, InvitationsController],
  providers: [AuthService, DatabaseService],
})
export class AppModule {}
