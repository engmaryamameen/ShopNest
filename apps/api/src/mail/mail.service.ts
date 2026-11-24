import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER, type MailProvider } from './mail.types';
import { passwordResetEmail, signupCodeEmail, vendorInviteEmail, verificationEmail } from './templates/auth';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly config: ConfigService,
  ) {}

  async sendSignupCode(to: string, code: string): Promise<void> {
    await this.provider.send({ to, ...signupCodeEmail(code) });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.provider.send({ to, ...verificationEmail(link) });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.provider.send({ to, ...passwordResetEmail(link) });
  }

  async sendVendorStaffInviteEmail(to: string, vendorName: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/vendor/staff/accept?token=${encodeURIComponent(token)}`;

    await this.provider.send({ to, ...vendorInviteEmail(vendorName, link) });
  }
}
