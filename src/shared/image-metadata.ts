import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from './attachments';
import type { ImageInput } from './types';

export interface ImageMetadata {
  mimeType: ImageInput['mimeType'];
  width: number;
  height: number;
}
const invalid = () => new Error('图片文件损坏或格式无效，请使用 PNG、JPEG 或 WebP 图片。');
const ascii = (bytes: Uint8Array, offset: number, count: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + count));
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function pngChecksum(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function validateDimensions(metadata: ImageMetadata): ImageMetadata {
  if (!metadata.width || !metadata.height) throw invalid();
  if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS)
    throw Object.assign(new Error('图片尺寸过大，请缩小到每边不超过 8192 像素、总像素不超过 2400 万。'), { code: 'dimensions' });
  return metadata;
}

/** Inspect bounded file headers before a browser or model decodes the image. */
export function inspectImage(bytes: Uint8Array): ImageMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let metadata: ImageMetadata | undefined;
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(bytes, 1, 7) === 'PNG\r\n\x1a\n') {
    let offset = 8, imageData = false, end = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset), type = ascii(bytes, offset + 4, 4);
      if (size > bytes.length - offset - 12) throw invalid();
      if (pngChecksum(bytes, offset + 4, offset + 8 + size) !== view.getUint32(offset + 8 + size)) throw invalid();
      if (offset === 8) {
        if (type !== 'IHDR' || size !== 13) throw invalid();
        const bitDepth = bytes[offset + 16], colorType = bytes[offset + 17];
        const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[colorType]?.includes(bitDepth) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20] > 1) throw invalid();
        metadata = validateDimensions({ mimeType: 'image/png', width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) });
      } else if (type === 'IHDR') throw invalid();
      if (type === 'acTL') throw invalid();
      if (type === 'IDAT' && size > 0) imageData = true;
      offset += size + 12;
      if (type === 'IEND') {
        if (size !== 0 || offset !== bytes.length) throw invalid();
        end = true;
        break;
      }
    }
    if (!imageData || !end) throw invalid();
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2, scan = false;
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw invalid();
    while (offset + 1 < bytes.length) {
      if (bytes[offset++] !== 0xff) throw invalid();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw invalid();
      const size = view.getUint16(offset);
      if (size < 2 || size > bytes.length - offset) throw invalid();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (size < 8) throw invalid();
        const frame = validateDimensions({ mimeType: 'image/jpeg', width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) });
        if (metadata && (metadata.width !== frame.width || metadata.height !== frame.height)) throw invalid();
        metadata = frame;
      }
      if (marker === 0xda) { scan = size >= 6 && offset + size < bytes.length - 2; break; }
      offset += size;
    }
    if (!scan || !metadata) throw invalid();
  } else if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    if (view.getUint32(4, true) + 8 !== bytes.length) throw invalid();
    const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    let offset = 12, imageData = false;
    while (offset + 8 <= bytes.length) {
      const type = ascii(bytes, offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
      if (size > bytes.length - start) throw invalid();
      if (type === 'VP8X') {
        if (size !== 10 || (bytes[start] & 2)) throw invalid(); // Animated images are not conversation screenshots.
        if (metadata) throw invalid();
        metadata = validateDimensions({ mimeType: 'image/webp', width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 });
      } else if (type === 'VP8 ') {
        if (size < 10 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) throw invalid();
        const frame = validateDimensions({ mimeType: 'image/webp', width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff });
        if (imageData || (metadata && (metadata.width !== frame.width || metadata.height !== frame.height))) throw invalid();
        metadata = frame;
        imageData = true;
      } else if (type === 'VP8L') {
        if (size < 5 || bytes[start] !== 0x2f) throw invalid();
        const bits = view.getUint32(start + 1, true);
        const frame = validateDimensions({ mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
        if (imageData || (metadata && (metadata.width !== frame.width || metadata.height !== frame.height))) throw invalid();
        metadata = frame;
        imageData = true;
      }
      offset = start + size + (size & 1);
    }
    if (offset !== bytes.length || !metadata || !imageData) throw invalid();
  }
  if (!metadata) throw invalid();
  return metadata;
}
