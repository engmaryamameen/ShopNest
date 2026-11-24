# Transactional emails

`layout.ts` contains the shared email shell, text escaping, and link button. `auth.ts` defines the subject, plain-text body, and HTML for each authentication email. The SMTP adapter sends both formats; the local adapter captures the same message for tests.

When adding a template, provide a useful plain-text version and escape all dynamic content in HTML. Keep important information in text rather than images, and use inline styles and presentation tables for email-client compatibility. Do not log verification codes or links in production. Check the rendered message in the intended email clients before release.
