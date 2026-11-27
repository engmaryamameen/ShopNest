import { fromBuffer } from 'file-type';
import imageSize from 'image-size';

export interface ValidatedImage {
  ext: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  width: number;
  height: number;
}

export class UnsupportedImageError extends Error {}
export class ImageTypeMismatchError extends Error {}
export class ImageTooLargeError extends Error {}

const ALLOWED: Record<string, ValidatedImage['mimeType']> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export async function validateImage(
  buffer: Buffer,
  declaredMimeType: string,
  maxDimensionPx: number,
): Promise<ValidatedImage> {
  const detected = await fromBuffer(buffer);
  if (!detected || !(detected.ext in ALLOWED)) {
    throw new UnsupportedImageError('File content is not a supported image type (JPEG, PNG, WEBP, GIF)');
  }

  const canonicalMime = ALLOWED[detected.ext];
  if (declaredMimeType !== canonicalMime) {
    throw new ImageTypeMismatchError(
      `Declared content type (${declaredMimeType}) does not match the file's actual content (${canonicalMime})`,
    );
  }

  let dimensions: { width?: number; height?: number };
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new UnsupportedImageError('Could not read image dimensions');
  }
  if (!dimensions.width || !dimensions.height) {
    throw new UnsupportedImageError('Could not read image dimensions');
  }
  if (dimensions.width > maxDimensionPx || dimensions.height > maxDimensionPx) {
    throw new ImageTooLargeError(
      `Image dimensions (${dimensions.width}x${dimensions.height}) exceed the ${maxDimensionPx}px limit`,
    );
  }

  return {
    ext: detected.ext as ValidatedImage['ext'],
    mimeType: canonicalMime,
    width: dimensions.width,
    height: dimensions.height,
  };
}
