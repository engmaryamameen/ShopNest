export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
