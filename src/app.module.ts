import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { MarketModule } from './market/market.module';
import { StockModule } from './stock/stock.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentModule } from './payment/payment.module';
import { PreferencesModule } from './preferences/preferences.module';

@Module({
  imports: [
    UserModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MailModule,
    AuthModule,
    NotificationsModule,
    MarketModule,
    StockModule,
    WalletModule,
    PaymentModule,
    PreferencesModule,
  ],
})
export class AppModule {}
