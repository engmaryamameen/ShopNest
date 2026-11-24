import { passwordResetEmail, signupCodeEmail, vendorInviteEmail, verificationEmail } from '../templates/auth';

describe('transactional email templates', () => {
  it('renders the verification code in both formats without exposing HTML', () => {
    const message = signupCodeEmail('<123456>');
    expect(message.text).toContain('<123456>');
    expect(message.html).toContain('&lt;123456&gt;');
    expect(message.html).not.toContain('<123456>');
    expect(message.html).toContain('10 minutes');
  });

  it('escapes vendor names and links in HTML while preserving the text alternative', () => {
    const name = '<script>alert(1)</script>';
    const link = 'https://shop.example/accept?token=abc&next=1';
    const message = vendorInviteEmail(name, link);
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('token=abc&amp;next=1');
    expect(message.text).toContain(link);
  });

  it.each([verificationEmail, passwordResetEmail])('includes a usable link and a text alternative', (template) => {
    const link = 'https://shop.example/path?token=abc';
    const message = template(link);
    expect(message.html).toContain(`href="${link}"`);
    expect(message.text).toContain(link);
    expect(message.html).toContain('Shop');
  });
});
