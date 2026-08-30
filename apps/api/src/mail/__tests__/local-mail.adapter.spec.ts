import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { LocalMailAdapter } from '../local-mail.adapter';

function makeLoggerMock() {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}

describe('LocalMailAdapter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'shopnest-mail-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function build(captureFile?: string) {
    const logger = makeLoggerMock();
    const config = { get: jest.fn().mockReturnValue(captureFile) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalMailAdapter,
        { provide: Logger, useValue: logger },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return { adapter: module.get(LocalMailAdapter), logger };
  }

  it('always logs the message (never sends) regardless of capture-file config', async () => {
    const { adapter, logger } = await build();
    await adapter.send({ to: 'a@b.com', subject: 'Hi', text: 'body with a token=abc123' });
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', subject: 'Hi', body: 'body with a token=abc123' }),
      expect.any(String),
    );
  });

  it('does not write any file when MAIL_TEST_CAPTURE_FILE is unset (default, every normal run)', async () => {
    const { adapter } = await build(undefined);
    await adapter.send({ to: 'a@b.com', subject: 'Hi', text: 'body' });
    // No file was created at all — nothing to read back.
    await expect(readFile(join(tmpDir, 'mail.jsonl'), 'utf8')).rejects.toThrow();
  });

  it('appends one JSON line per message when the capture file is explicitly set', async () => {
    const captureFile = join(tmpDir, 'mail.jsonl');
    const { adapter } = await build(captureFile);

    await adapter.send({ to: 'a@b.com', subject: 'Verify', text: 'link with token=xyz' });
    await adapter.send({ to: 'a@b.com', subject: 'Reset', text: 'link with token=abc' });

    const contents = await readFile(captureFile, 'utf8');
    const lines = contents.trim().split('\n').map((l) => JSON.parse(l));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ to: 'a@b.com', subject: 'Verify', text: 'link with token=xyz' });
    expect(lines[1]).toMatchObject({ subject: 'Reset' });
    expect(lines[0].sentAt).toEqual(expect.any(String));
  });
});
