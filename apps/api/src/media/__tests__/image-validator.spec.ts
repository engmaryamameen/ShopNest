import { validateImage, ImageTooLargeError, ImageTypeMismatchError, UnsupportedImageError } from '../image-validator';
import { pngBuffer, gifBuffer, webpBuffer, jpegBuffer, svgBuffer, htmlBuffer, textBuffer } from './fixtures';

const MAX_DIM = 8000;

describe('validateImage', () => {
  it('accepts a real PNG declared as image/png', async () => {
    const result = await validateImage(pngBuffer(10, 20), 'image/png', MAX_DIM);
    expect(result).toEqual({ ext: 'png', mimeType: 'image/png', width: 10, height: 20 });
  });

  it('accepts a real GIF declared as image/gif', async () => {
    const result = await validateImage(gifBuffer(5, 7), 'image/gif', MAX_DIM);
    expect(result).toEqual({ ext: 'gif', mimeType: 'image/gif', width: 5, height: 7 });
  });

  it('accepts a real WEBP declared as image/webp', async () => {
    const result = await validateImage(webpBuffer(3, 4), 'image/webp', MAX_DIM);
    expect(result).toEqual({ ext: 'webp', mimeType: 'image/webp', width: 3, height: 4 });
  });

  it('accepts a real JPEG declared as image/jpeg', async () => {
    const result = await validateImage(jpegBuffer(16, 32), 'image/jpeg', MAX_DIM);
    expect(result).toEqual({ ext: 'jpg', mimeType: 'image/jpeg', width: 16, height: 32 });
  });

  it('rejects an SVG declared as image/png', async () => {
    await expect(validateImage(svgBuffer, 'image/png', MAX_DIM)).rejects.toThrow(UnsupportedImageError);
  });

  it('rejects HTML declared as an image', async () => {
    await expect(validateImage(htmlBuffer, 'image/png', MAX_DIM)).rejects.toThrow(UnsupportedImageError);
    await expect(validateImage(htmlBuffer, 'image/jpeg', MAX_DIM)).rejects.toThrow(UnsupportedImageError);
  });

  it('rejects unsupported/unknown binary content', async () => {
    await expect(validateImage(textBuffer, 'image/png', MAX_DIM)).rejects.toThrow(UnsupportedImageError);
  });

  it('rejects an empty file', async () => {
    await expect(validateImage(Buffer.alloc(0), 'image/png', MAX_DIM)).rejects.toThrow(UnsupportedImageError);
  });

  it('rejects real PNG bytes declared with a mismatched image/jpeg content type', async () => {
    await expect(validateImage(pngBuffer(), 'image/jpeg', MAX_DIM)).rejects.toThrow(ImageTypeMismatchError);
  });

  it('rejects an image exceeding the configured dimension limit', async () => {
    await expect(validateImage(pngBuffer(9000, 10), 'image/png', MAX_DIM)).rejects.toThrow(ImageTooLargeError);
    await expect(validateImage(pngBuffer(10, 9000), 'image/png', MAX_DIM)).rejects.toThrow(ImageTooLargeError);
  });

  it('accepts an image exactly at the dimension limit', async () => {
    await expect(validateImage(pngBuffer(MAX_DIM, MAX_DIM), 'image/png', MAX_DIM)).resolves.toBeDefined();
  });
});
