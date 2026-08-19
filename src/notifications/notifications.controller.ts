import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService, SubscribeDto } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../auth/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Endpoint público que retorna apenas a VAPID public key (para o frontend). */
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notifications.getVapidPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: JwtPayload) {
    return this.notifications.subscribe(dto, user.sub);
  }

  @Delete('unsubscribe/:endpoint')
  @UseGuards(JwtAuthGuard)
  unsubscribe(
    @Param('endpoint') endpoint: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notifications.unsubscribe(
      decodeURIComponent(endpoint),
      user.sub,
    );
  }
}
