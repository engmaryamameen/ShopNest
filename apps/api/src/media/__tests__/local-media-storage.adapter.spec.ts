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

  it('writes the file to the configured upload directory, using the validated extension', async () => {
    const adapter = build();
    const result = await adapter.upload({ buffer: Buffer.from('fake-image-bytes'), ext: 'jpg', mimeType: 'image/jpeg' });

    expect(result.url).toMatch(/^http:\/\/localhost:3001\/uploads\/.+\.jpg$/);
    expect(result.contentType).toBe('image/jpeg');

    const filename = result.url.split('/uploads/')[1];
    const written = await readFile(join(uploadDir, filename));
    expect(written.toString()).toBe('fake-image-bytes');
  });

  it('returns the validated content type for each supported extension', async () => {
    const adapter = build();
    const png = await adapter.upload({ buffer: Buffer.from('a'), ext: 'png', mimeType: 'image/png' });
    const webp = await adapter.upload({ buffer: Buffer.from('b'), ext: 'webp', mimeType: 'image/webp' });
    const gif = await adapter.upload({ buffer: Buffer.from('c'), ext: 'gif', mimeType: 'image/gif' });

    expect(png.url.endsWith('.png')).toBe(true);
    expect(webp.url.endsWith('.webp')).toBe(true);
    expect(gif.url.endsWith('.gif')).toBe(true);
    expect([png.contentType, webp.contentType, gif.contentType]).toEqual(['image/png', 'image/webp', 'image/gif']);
  });

  it('generates the filename entirely server-side — two uploads never collide, and no caller-supplied name reaches the path', async () => {
    const adapter = build();
    const a = await adapter.upload({ buffer: Buffer.from('a'), ext: 'png', mimeType: 'image/png' });
    const b = await adapter.upload({ buffer: Buffer.from('b'), ext: 'png', mimeType: 'image/png' });
    expect(a.url).not.toBe(b.url);

    const filenameA = a.url.split('/uploads/')[1];
    expect(filenameA).toMatch(/^[0-9a-f-]{36}\.png$/);
  });
});
