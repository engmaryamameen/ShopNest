import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { MailMessage, MailProvider } from './mail.types';

/**
 * Default adapter — no credentials required. Logs the rendered email
 * (including the verification/reset/invite link) via the app's structured
 * Pino logger instead of sending it, so every flow that depends on
 * "receiving an email" is fully completable and testable — including in
 * Playwright/CI — without real SMTP. Selected whenever `MAIL_PROVIDER` is
 * unset or not `smtp` (see `mail.module.ts`).
 */
@Injectable()
export class LocalMailAdapter implements MailProvider {
  constructor(private readonly logger: Logger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      { to: message.to, subject: message.subject, body: message.text },
      'Email (local adapter — not actually sent)',
    );
  }
}
