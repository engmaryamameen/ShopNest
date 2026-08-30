import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalMediaStorageAdapter } from '../local-media-storage.adapter';

describe('LocalMediaStorageAdapter', () => {
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'shopnest-media-test-'));
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  function build() {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'app.mediaUploadDir') return uploadDir;
        if (key === 'app.mediaPublicBaseUrl') return 'http://localhost:3001';
        return fallback;
      }),
    };
    return new LocalMediaStorageAdapter(config as unknown as ConfigService);
  }

  it('writes the file to the configured upload directory and returns an absolute URL', async () => {
    const adapter = build();
    const result = await adapter.upload({
      buffer: Buffer.from('fake-image-bytes'),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
    });

    expect(result.url).toMatch(/^http:\/\/localhost:3001\/uploads\/.+\.jpg$/);

    const filename = result.url.split('/uploads/')[1];
    const written = await readFile(join(uploadDir, filename));
    expect(written.toString()).toBe('fake-image-bytes');
  });

  it('gives each upload a unique filename even for the same original name', async () => {
    const adapter = build();
    const a = await adapter.upload({ buffer: Buffer.from('a'), originalName: 'x.png', mimeType: 'image/png' });
    const b = await adapter.upload({ buffer: Buffer.from('b'), originalName: 'x.png', mimeType: 'image/png' });
    expect(a.url).not.toBe(b.url);
  });
});
