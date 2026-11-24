import type { INestApplication } from '@nestjs/common';
import { MailService } from '../src/mail/mail.service';

export function captureSignupCodes(app: INestApplication): Map<string, string> {
  const codes = new Map<string, string>();
  jest.spyOn(app.get(MailService), 'sendSignupCode').mockImplementation(async (email, code) => {
    codes.set(email, code);
  });
  return codes;
}

export async function registerTestUser(base: string, origin: string, email: string, password: string, codes: Map<string, string>): Promise<Response> {
  const headers = { 'content-type': 'application/json', origin };
  const registration = await fetch(`${base}/auth/register`, {
    method: 'POST', headers, body: JSON.stringify({ email, password }),
  });
  if (registration.status !== 202) throw new Error(`Signup failed: ${registration.status} ${await registration.text()}`);
  const code = codes.get(email);
  if (!code) throw new Error('Signup did not send a verification code');
  const cookie = registration.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const verified = await fetch(`${base}/auth/signup/verify`, {
    method: 'POST', headers: { ...headers, cookie }, body: JSON.stringify({ code }),
  });
  if (verified.status !== 201) throw new Error(`Signup verification failed: ${verified.status} ${await verified.text()}`);
  return verified;
}
