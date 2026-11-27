import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LocalMediaStorageAdapter } from '../media/local-media-storage.adapter';
import { validateImage } from '../media/image-validator';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  'images.openfoodfacts.org',
  'images.openbeautyfacts.org',
  'm.media-amazon.com',
  'images.icecat.biz',
  'img.drz.lazcdn.com',
  'amazon-berkeley-objects.s3.us-east-1.amazonaws.com',
]);

@Injectable()
export class CatalogImportImagesService {
  readonly metrics = {
    requests: 0,
    cacheHits: 0,
    bytes: 0,
    networkMs: 0,
    validationMs: 0,
    storageMs: 0,
    failures: 0,
    qualityRejected: 0,
  };
  readonly failuresByReason: Record<string, number> = {};
  private readonly cache = new Map<
    string,
    { url: string | null; dimension: number; expiresAt: number }
  >();
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly storage: LocalMediaStorageAdapter) {}

  async ingest(
    urls: string[],
    minDimension = 0,
    onProgress?: (checked: number, total: number) => Promise<void>,
    maxImages = 10,
  ): Promise<string[]> {
    const uploads = new Map<string, Promise<string>>();
    const candidates = [...new Set(urls)].slice(0, 10);
    let checked = 0;
    const saved = new Set<string>();
    for (let offset = 0; offset < candidates.length && saved.size < maxImages; ) {
      const batch = candidates.slice(offset, offset + Math.min(3, maxImages - saved.size));
      offset += batch.length;
      const results = await Promise.all(
        batch.map(async (value) => {
          if (this.running >= 3) await new Promise<void>((resolve) => this.waiting.push(resolve));
          else this.running++;
          let result: string | null;
          try {
            result = await this.ingestImage(value, minDimension, uploads);
          } finally {
            const next = this.waiting.shift();
            if (next) next();
            else this.running--;
          }
          await onProgress?.(++checked, candidates.length);
          return result;
        }),
      );
      for (const result of results) if (result) saved.add(result);
    }
    return [...saved];
  }

  private async ingestImage(
    value: string,
    minDimension: number,
    uploads: Map<string, Promise<string>>,
  ): Promise<string | null> {
    try {
      const cached = this.cache.get(value);
      if (
        cached &&
        cached.expiresAt > Date.now() &&
        (cached.url || cached.dimension < minDimension || cached.dimension === 0)
      ) {
        this.metrics.cacheHits++;
        return cached.dimension >= minDimension ? cached.url : null;
      }
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !ALLOWED_HOSTS.has(url.hostname)
      )
        return null;
      const networkStarted = performance.now();
      this.metrics.requests++;
      let networkFinished = false;
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' },
      }).catch((error) => {
        this.metrics.networkMs += performance.now() - networkStarted;
        throw error;
      });
      const exceedsDeclaredLimit = Number(response.headers.get('content-length') || 0) > MAX_BYTES;
      if (!response.ok || !response.body || exceedsDeclaredLimit) {
        await response.body?.cancel();
        this.metrics.networkMs += performance.now() - networkStarted;
        this.metrics.failures++;
        const reason = !response.ok
          ? `HTTP ${response.status}`
          : !response.body
            ? 'Empty response body'
            : 'Declared image size exceeds limit';
        this.failuresByReason[reason] = (this.failuresByReason[reason] ?? 0) + 1;
        this.remember(value, null, 0, 600000);
        return null;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.length;
          if (size > MAX_BYTES) throw new Error('Image is too large');
          chunks.push(chunk);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        if (!networkFinished) {
          this.metrics.networkMs += performance.now() - networkStarted;
          networkFinished = true;
        }
      }
      const buffer = Buffer.concat(chunks);
      this.metrics.bytes += buffer.length;
      const hash = createHash('sha256').update(buffer).digest('hex');
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      const validationStarted = performance.now();
      const image = await validateImage(buffer, mime, 8000).finally(() => {
        this.metrics.validationMs += performance.now() - validationStarted;
      });
      if (Math.max(image.width, image.height) < minDimension) {
        this.metrics.qualityRejected++;
        this.remember(value, null, Math.max(image.width, image.height), 3600000);
        return null;
      }
      let uploaded = uploads.get(hash);
      if (!uploaded) {
        const storageStarted = performance.now();
        uploaded = this.storage
          .upload({ buffer, ext: image.ext, mimeType: image.mimeType }, hash)
          .then((stored) => stored.url)
          .finally(() => {
            this.metrics.storageMs += performance.now() - storageStarted;
          });
        uploads.set(hash, uploaded);
      }
      const storedUrl = await uploaded;
      this.remember(value, storedUrl, Math.max(image.width, image.height), 3600000);
      return storedUrl;
    } catch (error) {
      this.metrics.failures++;
      const reason = error instanceof Error ? error.name : 'Unknown error';
      this.failuresByReason[reason] = (this.failuresByReason[reason] ?? 0) + 1;
      this.remember(value, null, 0, 600000);
      // An unavailable or invalid image does not prevent importing the product.
      return null;
    }
  }

  private remember(key: string, url: string | null, dimension: number, ttl: number) {
    if (this.cache.size >= 2000) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { url, dimension, expiresAt: Date.now() + ttl });
  }
}
