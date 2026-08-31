function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngBuffer(width = 1, height = 1): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrType = Buffer.from('IHDR', 'ascii');
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0);

  const iendLength = Buffer.from([0, 0, 0, 0]);
  const iendType = Buffer.from('IEND', 'ascii');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(crc32(iendType), 0);

  return Buffer.concat([signature, ihdrLength, ihdrType, ihdrData, ihdrCrc, iendLength, iendType, iendCrc]);
}

export function gifBuffer(width = 1, height = 1): Buffer {
  const header = Buffer.from('GIF89a', 'ascii');
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0; // packed
  screen[5] = 0; // background color index
  screen[6] = 0; // pixel aspect ratio
  const trailer = Buffer.from([0x3b]);
  return Buffer.concat([header, screen, trailer]);
}

export function webpBuffer(width = 1, height = 1): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0; // flags
  vp8x[1] = 0;
  vp8x[2] = 0;
  vp8x[3] = 0;
  const w = width - 1;
  const h = height - 1;
  vp8x[4] = w & 0xff;
  vp8x[5] = (w >> 8) & 0xff;
  vp8x[6] = (w >> 16) & 0xff;
  vp8x[7] = h & 0xff;
  vp8x[8] = (h >> 8) & 0xff;
  vp8x[9] = (h >> 16) & 0xff;

  const vp8xChunk = Buffer.concat([
    Buffer.from('VP8X', 'ascii'),
    (() => {
      const len = Buffer.alloc(4);
      len.writeUInt32LE(10, 0);
      return len;
    })(),
    vp8x,
  ]);

  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + vp8xChunk.length, 0);

  return Buffer.concat([Buffer.from('RIFF', 'ascii'), riffSize, Buffer.from('WEBP', 'ascii'), vp8xChunk]);
}

export function jpegBuffer(width = 1, height = 1): Buffer {
  const segment = Buffer.alloc(11);
  segment.writeUInt16BE(11, 0); // length field
  segment[2] = 8; // precision
  segment.writeUInt16BE(height, 3);
  segment.writeUInt16BE(width, 5);
  segment[7] = 1; // number of components (Nf)
  segment[8] = 1; // component id
  segment[9] = 0x11; // sampling factors
  segment[10] = 0x00; // quant table selector

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xfe, 0x00, 0x04, 0x00, 0x00]), // COM marker, forces a segment boundary before SOF0
    Buffer.from([0xff, 0xc0]), // SOF0 marker
    segment,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

export const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
export const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');
export const textBuffer = Buffer.from('just some plain text, not an image at all');
