import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [UserController],
  exports: [UserController],
})
export class UserModule {}
