import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import * as nodemailer from 'nodemailer';
import type { MailMessage, MailProvider } from './mail.types';

/**
 * Real delivery via SMTP (`nodemailer`), selected when `MAIL_PROVIDER=smtp`
 * and the `SMTP_*` env vars are configured (see `.env.example`). The
 * transport is created lazily on first send rather than at module
 * construction, so an application boot with `MAIL_PROVIDER` unset never
 * pays the cost of configuring a transport it will never use — `MailModule`
 * always registers both adapters, `useFactory` in `mail.module.ts` just
 * decides which one is injected as `MAIL_PROVIDER`.
 */
@Injectable()
export class SmtpMailAdapter implements MailProvider, OnModuleInit {
  private transport: nodemailer.Transporter | null = null;
  private fromAddress = '';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    // Only construct the transport if this adapter was actually selected —
    // avoids a pointless connection-pool setup in the (default) local-mail
    // configuration.
    if (this.config.get<string>('app.mailProvider') !== 'smtp') return;

    this.fromAddress = this.config.get<string>('app.mailFromAddress', 'no-reply@shopnest.local');
    this.transport = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('app.smtpHost'),
      port: this.config.get<number>('app.smtpPort', 587),
      secure: this.config.get<number>('app.smtpPort', 587) === 465,
      auth: this.config.get<string>('app.smtpUser')
        ? {
            user: this.config.get<string>('app.smtpUser'),
            pass: this.config.get<string>('app.smtpPassword'),
          }
        : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      throw new Error('SmtpMailAdapter.send() called without SMTP configuration — check MAIL_PROVIDER/SMTP_* env vars');
    }

    await this.transport.sendMail({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    this.logger.log({ to: message.to, subject: message.subject }, 'Email sent via SMTP');
  }
}
