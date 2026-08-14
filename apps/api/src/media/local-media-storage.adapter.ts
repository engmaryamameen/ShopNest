import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import type { MediaStorageProvider, UploadedFile } from './media.types';

/** No bucket credentials in this scope — this is the only
 * MediaStorageProvider, same "real interface, local/test adapter" shape
 * already used for mail and payment. Files land on local disk, under
 * whatever directory app.mediaUploadDir resolves to; main.ts serves that
 * same directory back out at /uploads. */
@Injectable()
export class LocalMediaStorageAdapter implements MediaStorageProvider {
  constructor(private readonly config: ConfigService) {}

  async upload(file: UploadedFile): Promise<{ url: string }> {
    const uploadDir = this.config.get<string>('app.mediaUploadDir', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const ext = extname(file.originalName).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(uploadDir, filename), file.buffer);

    const baseUrl = this.config.get<string>('app.mediaPublicBaseUrl', 'http://localhost:3001');
    return { url: `${baseUrl}/uploads/${filename}` };
  }
}
