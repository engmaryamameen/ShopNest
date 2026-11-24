import { readFile } from 'node:fs/promises';
import { MAIL_CAPTURE_FILE } from '../../playwright.config';

interface CapturedMail {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

/**
 * Reads the most recent captured email to `to` whose subject contains
 * `subjectIncludes`, and pulls the `token=` query param out of the link in
 * its body. Polls briefly since the API writes the file asynchronously
 * relative to the HTTP response the test just awaited.
 */
export async function waitForToken(
  to: string,
  subjectIncludes: string,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const mail = await readCapturedMail();
    const match = [...mail].reverse().find((m) => m.to === to && m.subject.includes(subjectIncludes));

    if (match) {
      const token = /token=([0-9a-f]{128})/.exec(match.text)?.[1];
      if (token) return token;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`No captured email to ${to} with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

async function readCapturedMail(): Promise<CapturedMail[]> {
  try {
    const contents = await readFile(MAIL_CAPTURE_FILE, 'utf8');
    return contents
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedMail);
  } catch {
    return []; // file doesn't exist yet — no mail captured so far
  }
}

export async function waitForSignupCode(to: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = await readCapturedMail();
    const message = [...mail].reverse().find((item) => item.to === to && item.subject === 'Your ShopNest verification code');
    const code = message?.text.match(/verification code is (\d{6})/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`No verification code captured for ${to}`);
}
