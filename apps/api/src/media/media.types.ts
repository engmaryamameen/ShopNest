export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface MediaStorageProvider {
  /** Returns the absolute, publicly-fetchable URL for the stored file. */
  upload(file: UploadedFile): Promise<{ url: string }>;
}
