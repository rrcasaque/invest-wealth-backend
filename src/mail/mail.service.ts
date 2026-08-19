import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { login2faSubject, login2faTemplate } from './templates/login-2fa';
import {
  passwordResetSubject,
  passwordResetTemplate,
} from './templates/password-reset';
import {
  verificationCodeSubject,
  verificationCodeTemplate,
} from './templates/verification-code';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;
  private readonly logOnly: boolean;

  constructor(private readonly config: ConfigService) {
    this.from =
      this.config.get<string>('MAIL_FROM') ??
      'InvestWealth <no-reply@investwealth.app>';
    this.logOnly = this.config.get<string>('MAIL_LOG_ONLY') === 'true';

    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '465');
    const secure = this.config.get<string>('SMTP_SECURE') !== 'false';
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER/SMTP_PASS ausentes — e-mails serão apenas logados.',
      );
      this.logOnly = true;
    } else if (!this.logOnly) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.logger.log(`Transporter SMTP configurado (${host}:${port}).`);
    } else {
      this.logger.warn(
        'MAIL_LOG_ONLY=true — códigos serão logados, não enviados.',
      );
    }
  }

  async sendVerificationCode(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    await this.send({
      to: email,
      subject: verificationCodeSubject(),
      html: verificationCodeTemplate(name, code),
      code,
      kind: 'EMAIL_VERIFICATION',
    });
  }

  async sendLogin2faCode(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    await this.send({
      to: email,
      subject: login2faSubject(),
      html: login2faTemplate(name, code),
      code,
      kind: 'LOGIN_2FA',
    });
  }

  async sendPasswordResetCode(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    await this.send({
      to: email,
      subject: passwordResetSubject(),
      html: passwordResetTemplate(name, code),
      code,
      kind: 'PASSWORD_RESET',
    });
  }

  private async send(args: {
    to: string;
    subject: string;
    html: string;
    code: string;
    kind: string;
  }): Promise<void> {
    if (this.logOnly || !this.transporter) {
      this.logger.log(`[${args.kind}] para=${args.to} código=${args.code}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: args.to,
        subject: args.subject,
        html: args.html,
      });
      this.logger.log(`[${args.kind}] enviado para ${args.to}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${args.kind}] falha ao enviar para ${args.to}: ${msg}`,
      );
      // Em modo log-only de fallback, garante que o código apareça para teste.
      this.logger.warn(`[${args.kind}] código de fallback: ${args.code}`);
      throw err;
    }
  }
}
