import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { IsString, IsObject, IsOptional } from 'class-validator';
import webpush, { PushSubscription as WpSubscription, SendResult } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export class SubscribeDto {
  @IsString()
  endpoint: string;

  @IsObject()
  keys: {
    p256dh: string;
    auth: string;
  };

  @IsOptional()
  expirationTime?: number | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.vapidPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
    this.vapidPrivateKey = this.config.get<string>('VAPID_PRIVATE_KEY') ?? '';
    this.vapidSubject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:contato@investwealth.app';

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
      this.logger.log('VAPID configurado.');
    } else {
      this.logger.warn('VAPID keys ausentes — push notifications desativados.');
    }
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  async subscribe(dto: SubscribeDto) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      return this.prisma.pushSubscription.update({
        where: { endpoint: dto.endpoint },
        data: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      });
    }
    return this.prisma.pushSubscription.create({
      data: {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async unsubscribe(endpoint: string) {
    try {
      await this.prisma.pushSubscription.delete({ where: { endpoint } });
    } catch {
      // já não existia — ok
    }
    return { ok: true };
  }

  /**
   * Cron que dispara uma notificação push uma vez por dia, às 9h da manhã
   * (horário de Brasília, UTC-3), para todas as inscrições ativas.
   * Em UTC isso equivale a 12h, já que o cron roda no fuso do servidor.
   */
  @Cron('0 12 * * *')
  async sendScheduledPushNotifications() {
    const subs = await this.prisma.pushSubscription.findMany();
    if (subs.length === 0) {
      this.logger.debug('Nenhuma inscrição — pulando push agendado.');
      return;
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const payload = JSON.stringify({
      title: 'InvestWealth — Atualização',
      body: `Notificação automática disparada às ${now}.`,
      icon: '/favicon.svg',
      tag: 'investwealth-cron',
      data: { timestamp: Date.now() },
    });

    this.logger.log(`Enviando push para ${subs.length} inscrição(ões)...`);

    const results = await Promise.allSettled(
      subs.map((s) =>
        this.sendPush(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.length - fulfilled;
    this.logger.log(`Push concluído: ${fulfilled} ok, ${rejected} falha(s).`);

    // Remove inscrições que retornaram 404/410 (endpoint expirado)
    await this.pruneExpiredSubscriptions(subs, results);
  }

  private async sendPush(
    subscription: WpSubscription,
    payload: string,
  ): Promise<SendResult> {
    return webpush.sendNotification(subscription, payload, {
      TTL: 300,
    });
  }

  private async pruneExpiredSubscriptions(
    subs: Array<{ endpoint: string }>,
    results: PromiseSettledResult<unknown>[],
  ): Promise<void> {
    const expired: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const err = r.reason as { statusCode?: number } | undefined;
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expired.push(subs[i].endpoint);
        }
      }
    });
    if (expired.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: expired } },
      });
      this.logger.log(`Removidas ${expired.length} inscrição(ões) expiradas.`);
    }
  }
}
