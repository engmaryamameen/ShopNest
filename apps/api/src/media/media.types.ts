export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');

export interface UploadedFile {
  buffer: Buffer;
  ext: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface MediaStorageProvider {
  /** Returns the absolute, publicly-fetchable URL for the stored file. */
  upload(file: UploadedFile): Promise<{ url: string; contentType: string }>;
}
