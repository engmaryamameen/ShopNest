export type MailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Every email this app sends is a short transactional
   * notice with one link — no HTML templating layer is warranted yet. */
  text: string;
};

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
