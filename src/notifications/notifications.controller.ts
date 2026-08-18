import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { NotificationsService, SubscribeDto } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Endpoint público que retorna apenas a VAPID public key (para o frontend). */
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notifications.getVapidPublicKey() };
  }

  @Post('subscribe')
  subscribe(@Body() dto: SubscribeDto) {
    return this.notifications.subscribe(dto);
  }

  @Delete('unsubscribe/:endpoint')
  unsubscribe(@Param('endpoint') endpoint: string) {
    return this.notifications.unsubscribe(decodeURIComponent(endpoint));
  }
}
