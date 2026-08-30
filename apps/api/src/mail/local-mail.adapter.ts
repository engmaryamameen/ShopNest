import { appendFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { MailMessage, MailProvider } from './mail.types';

/**
 * Default adapter — no credentials required. Logs the rendered email
 * (including the verification/reset/invite link) via the app's structured
 * Pino logger instead of sending it, so every flow that depends on
 * "receiving an email" is fully completable and testable — including in
 * Playwright/CI — without real SMTP. Selected whenever `MAIL_PROVIDER` is
 * unset or not `smtp` (see `mail.module.ts`); refused outright in
 * production (`env.validation.ts`) since it puts bearer tokens in plain
 * text into stdout/log aggregators.
 *
 * When `MAIL_TEST_CAPTURE_FILE` is set, each message is *also* appended as
 * one JSON line to that file — a file-based "fake inbox" the Playwright
 * suite reads to pull a real verification/reset link out of a real send,
 * without any HTTP-reachable backdoor. Unset by default (every normal dev
 * run), so this has zero effect outside an explicit opt-in test run.
 */
@Injectable()
export class LocalMailAdapter implements MailProvider {
  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigService,
  ) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      { to: message.to, subject: message.subject, body: message.text },
      'Email (local adapter — not actually sent)',
    );

    const captureFile = this.config.get<string>('app.mailTestCaptureFile');
    if (!captureFile) return;

    const line = JSON.stringify({ ...message, sentAt: new Date().toISOString() });
    await appendFile(captureFile, line + '\n', 'utf8');
  }
}
