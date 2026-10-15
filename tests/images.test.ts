import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateImages } from '../src/main/images';
import { inspectImage } from '../src/shared/image-metadata';
import { MAX_IMAGE_BYTES } from '../src/shared/attachments';
import type { ImageInput } from '../src/shared/types';

const png = readFileSync(new URL('../assets/icon.png', import.meta.url));
// Synthetic 2×2 black JPEG, with no user image or metadata.
const validJpeg = readFileSync(new URL('./fixtures/tiny-image.jpg', import.meta.url));
const webp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const image = (bytes: Buffer = png, mimeType: ImageInput['mimeType'] = 'image/png'): ImageInput => ({ mimeType, data: bytes.toString('base64'), name: 'example' });

describe('bounded screenshot attachments', () => {
  it('accepts the supported image signatures and preserves attachment content', () => {
    const inputs = [image(), image(validJpeg, 'image/jpeg'), image(webp, 'image/webp')];
    expect(validateImages(inputs)).toEqual(inputs);
    expect(inspectImage(validJpeg)).toEqual({ mimeType: 'image/jpeg', width: 2, height: 2 });
    expect(inspectImage(webp)).toEqual({ mimeType: 'image/webp', width: 1, height: 1 });
    expect(validateImages(undefined)).toEqual([]);
  });
  it('rejects remote URLs, SVG, mismatched MIME, truncated files, and unknown fields', () => {
    for (const value of [null, {}, [null], [{ ...image(), data: 'https://example.test/private.png' }],
      [{ ...image(), data: 'data:image/png;base64,' + image().data }],
      [{ mimeType: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }],
      [image(png, 'image/jpeg')], [image(png.subarray(0, 33))], [image(validJpeg.subarray(0, 100), 'image/jpeg')],
      [{ ...image(), path: 'C:/private.png' }], [{ ...image(), name: 'x'.repeat(201) }]]) {
      expect(() => validateImages(value)).toThrow();
    }
    const corrupted = Buffer.from(png);
    corrupted[29] ^= 1;
    expect(() => validateImages([image(corrupted)])).toThrow('损坏');
    expect(() => validateImages([image(Buffer.from('<html>hello</html>'))])).toThrow('损坏');
  });
  it('accepts only canonical base64 and never includes it in an error', () => {
    for (const data of [image().data + '\n', 'AA=A', 'AB==', 'AA', '====', 'secret invalid base64']) {
      expect(() => validateImages([{ mimeType: 'image/png', data }])).toThrow();
      try { validateImages([{ mimeType: 'image/png', data }]); } catch (error) { expect(String(error)).not.toContain(data); }
    }
  });
  it('limits image count, individual bytes, and total bytes', () => {
    expect(() => validateImages(Array(5).fill(image()))).toThrow('4');
    expect(() => validateImages([image(Buffer.alloc(MAX_IMAGE_BYTES + 1))])).toThrow('5 MiB');
    // Valid JPEG comment segments grow the file without increasing decoded size.
    const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0xff]), Buffer.alloc(65533, 65)]);
    const padded = Buffer.concat([validJpeg.subarray(0, 2), ...Array(70).fill(comment), validJpeg.subarray(2)]);
    expect(validateImages([image(padded, 'image/jpeg')])).toHaveLength(1);
    expect(() => validateImages(Array(3).fill(image(padded, 'image/jpeg')))).toThrow('12 MiB');
  });
  it('rejects oversized decoded images before rendering or sending them', () => {
    const largeJpeg = Buffer.from(validJpeg);
    const start = largeJpeg.indexOf(Buffer.from([0xff, 0xc0]));
    largeJpeg.writeUInt16BE(8193, start + 7);
    expect(() => inspectImage(largeJpeg)).toThrow('8192');
    try { inspectImage(largeJpeg); } catch (error) { expect(error).toHaveProperty('code', 'dimensions'); }
    largeJpeg.writeUInt16BE(6000, start + 7);
    largeJpeg.writeUInt16BE(5000, start + 5);
    expect(() => validateImages([image(largeJpeg, 'image/jpeg')])).toThrow('2400');
  });
});
