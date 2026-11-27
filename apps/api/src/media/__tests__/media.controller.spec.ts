import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from '../media.controller';
import type { MediaStorageProvider } from '../media.types';
import { pngBuffer, svgBuffer, htmlBuffer, textBuffer } from './fixtures';

function makeFile(overrides: Partial<Express.Multer.File>): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: pngBuffer(),
    size: 100,
    ...overrides,
  } as Express.Multer.File;
}

describe('MediaController', () => {
  let storage: jest.Mocked<MediaStorageProvider>;
  let config: ConfigService;
  let controller: MediaController;

  beforeEach(() => {
    storage = { upload: jest.fn().mockResolvedValue({ url: 'http://localhost:3001/uploads/abc.png', contentType: 'image/png' }) };
    config = { get: jest.fn().mockReturnValue(8000) } as unknown as ConfigService;
    controller = new MediaController(storage, config);
  });

  it('accepts a genuine PNG and forwards only buffer/ext/mimeType — never the client filename — to storage', async () => {
    const file = makeFile({ originalname: 'anything-the-client-wants.exe', buffer: pngBuffer(4, 4) });

    await controller.upload(file);

    expect(storage.upload).toHaveBeenCalledWith({ buffer: file.buffer, ext: 'png', mimeType: 'image/png' });
  });

  it('ignores a malicious client-supplied filename entirely — PNG bytes uploaded as "x.svg" still resolve to .png', async () => {
    const file = makeFile({ originalname: 'x.svg', mimetype: 'image/png', buffer: pngBuffer() });

    await controller.upload(file);

    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ ext: 'png', mimeType: 'image/png' }));
  });

  it('ignores a double-extension client filename — outcome depends only on real content', async () => {
    const file = makeFile({ originalname: 'evil.svg.png', mimetype: 'image/png', buffer: pngBuffer() });

    await controller.upload(file);

    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ ext: 'png' }));
  });

  it('rejects an SVG declared as image/png', async () => {
    const file = makeFile({ mimetype: 'image/png', buffer: svgBuffer });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects HTML declared as an image', async () => {
    const file = makeFile({ mimetype: 'image/jpeg', buffer: htmlBuffer });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects unsupported binary content', async () => {
    const file = makeFile({ buffer: textBuffer });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
  });

  it('rejects an empty file', async () => {
    const file = makeFile({ buffer: Buffer.alloc(0) });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
  });

  it('rejects a declared/actual content-type mismatch even when both are otherwise-supported formats', async () => {
    const file = makeFile({ mimetype: 'image/jpeg', buffer: pngBuffer() });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
  });

  it('rejects an image over the configured dimension limit', async () => {
    config.get = jest.fn().mockReturnValue(100);
    const file = makeFile({ mimetype: 'image/png', buffer: pngBuffer(500, 500) });
    await expect(controller.upload(file)).rejects.toThrow(BadRequestException);
  });
});
