import { actionButton, emailLayout, escapeHtml, paragraph } from './layout';

type RenderedEmail = { subject: string; text: string; html: string };

export function signupCodeEmail(code: string): RenderedEmail {
  return {
    subject: 'Your ShopNest verification code',
    text: `Your ShopNest verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: emailLayout({
      preview: 'Use this code to finish creating your account.',
      title: 'Verify your email',
      content: `${paragraph('Enter this code in ShopNest to finish creating your account.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="padding:16px 24px;background:#eef7fc;border:1px solid #d3eaf5;border-radius:10px;font-size:30px;line-height:1.2;font-weight:bold;letter-spacing:8px;color:#123b51;">${escapeHtml(code)}</td></tr></table>
${paragraph('This code expires in 10 minutes. For your security, do not share it with anyone.')}
<p style="margin:24px 0 0;font-size:13px;color:#667b8a;">If you didn’t request this code, you can ignore this email.</p>`,
    }),
  };
}

export function verificationEmail(link: string): RenderedEmail {
  return {
    subject: 'Verify your ShopNest email address',
    text: `Welcome to ShopNest! Confirm your email address by visiting:\n\n${link}\n\nIf you didn't create a ShopNest account, you can ignore this email.`,
    html: emailLayout({ preview: 'Confirm your email address for ShopNest.', title: 'Confirm your email', content: `${paragraph('Confirm your email address to complete verification.')}${actionButton('Verify email', link)}${paragraph('If you didn’t create a ShopNest account, you can ignore this email.')}` }),
  };
}

export function passwordResetEmail(link: string): RenderedEmail {
  return {
    subject: 'Reset your ShopNest password',
    text: `We received a request to reset your ShopNest password. Visit the link below to choose a new one:\n\n${link}\n\nThis link can only be used once. If you didn't request this, you can safely ignore this email — your password will not be changed.`,
    html: emailLayout({ preview: 'Choose a new password for your ShopNest account.', title: 'Reset your password', content: `${paragraph('We received a request to reset the password for your ShopNest account.')}${actionButton('Reset password', link)}${paragraph('This link can only be used once. If you didn’t request a reset, you can ignore this email. Your password will stay the same.')}` }),
  };
}

export function vendorInviteEmail(vendorName: string, link: string): RenderedEmail {
  return {
    subject: `You've been invited to join ${vendorName} on ShopNest`,
    text: `You've been invited to join ${vendorName}'s ShopNest vendor account. If you already have a ShopNest account, sign in first, then visit:\n\n${link}\n\nThis invite expires in 7 days. If you weren't expecting this, you can ignore this email.`,
    html: emailLayout({ preview: 'You have an invitation to join a ShopNest vendor account.', title: 'You’re invited', content: `${paragraph(`You’ve been invited to join ${vendorName} on ShopNest. If you already have an account, sign in first.`)}${actionButton('View invitation', link)}${paragraph('This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.')}` }),
  };
}
