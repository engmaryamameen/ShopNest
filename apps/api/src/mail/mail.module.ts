import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER } from './mail.types';
import { LocalMailAdapter } from './local-mail.adapter';
import { SmtpMailAdapter } from './smtp-mail.adapter';
import { MailService } from './mail.service';

@Module({
  providers: [
    LocalMailAdapter,
    SmtpMailAdapter,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService, SmtpMailAdapter, LocalMailAdapter],
      useFactory: (config: ConfigService, smtp: SmtpMailAdapter, local: LocalMailAdapter) =>
        config.get<string>('app.mailProvider') === 'smtp' ? smtp : local,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
