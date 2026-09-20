import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER, type MailProvider } from './mail.types';

/** Composes ShopNest's transactional emails. Callers never touch
 * `MailProvider` directly — subject lines and link shapes stay consistent
 * here. */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly config: ConfigService,
  ) {}

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.provider.send({
      to,
      subject: 'Verify your ShopNest email address',
      text: `Welcome to ShopNest! Confirm your email address by visiting:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create a ShopNest account, you can ignore this email.`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.provider.send({
      to,
      subject: 'Reset your ShopNest password',
      text: `We received a request to reset your ShopNest password. Visit the link below to choose a new one:\n\n${link}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password will not be changed.`,
    });
  }

  async sendVendorStaffInviteEmail(to: string, vendorName: string, token: string): Promise<void> {
    const webUrl = this.config.get<string>('app.webUrl', 'http://localhost:3000');
    const link = `${webUrl}/vendor/staff/accept?token=${encodeURIComponent(token)}`;

    await this.provider.send({
      to,
      subject: `You've been invited to join ${vendorName} on ShopNest`,
      text: `You've been invited to join ${vendorName}'s ShopNest vendor account. If you already have a ShopNest account, sign in first, then visit:\n\n${link}\n\nThis invite expires in 7 days. If you weren't expecting this, you can ignore this email.`,
    });
  }
}
