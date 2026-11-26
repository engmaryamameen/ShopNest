import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import type { MediaStorageProvider, UploadedFile } from './media.types';

@Injectable()
export class LocalMediaStorageAdapter implements MediaStorageProvider {
  constructor(private readonly config: ConfigService) {}

  async upload(file: UploadedFile, contentHash?: string): Promise<{ url: string; contentType: string }> {
    const uploadDir = this.config.get<string>('app.mediaUploadDir', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('Invalid content hash');
    const filename = `${contentHash ?? randomUUID()}.${file.ext}`;
    await writeFile(join(uploadDir, filename), file.buffer);

    const baseUrl = this.config.get<string>('app.mediaPublicBaseUrl', 'http://localhost:3001');
    return { url: `${baseUrl}/uploads/${filename}`, contentType: file.mimeType };
  }
}
