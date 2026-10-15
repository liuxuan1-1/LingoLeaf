import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, IMAGE_MIME_TYPES } from '../shared/attachments';
import { inspectImage } from '../shared/image-metadata';
import type { ImageInput } from '../shared/types';

/** Validate IPC/model attachments without logging or persisting image content. */
export function validateImages(value: unknown): ImageInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IMAGES)
    throw new Error('一次最多添加 4 张图片。');
  let total = 0;
  return value.map((item): ImageInput => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).some((key) => !['mimeType', 'data', 'name'].includes(key)) ||
      !IMAGE_MIME_TYPES.includes(item.mimeType) || typeof item.data !== 'string' ||
      (item.name !== undefined && (typeof item.name !== 'string' || item.name.length > 200)))
      throw new Error('图片格式无效，请使用 PNG、JPEG 或 WebP 图片。');
    if (!item.data.length || item.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
      throw new Error('每张图片最多 5 MiB，请压缩后重试。');
    if (item.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))
      throw new Error('图片数据无效，请重新粘贴或选择文件。');
    const bytes = Buffer.from(item.data, 'base64');
    if (bytes.toString('base64') !== item.data) throw new Error('图片数据无效，请重新粘贴或选择文件。');
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('每张图片最多 5 MiB，请压缩后重试。');
    total += bytes.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('图片总大小最多 12 MiB，请减少图片或压缩后重试。');
    if (inspectImage(bytes).mimeType !== item.mimeType)
      throw new Error('图片文件内容与格式不一致，请重新导出为 PNG、JPEG 或 WebP。');
    return { mimeType: item.mimeType, data: item.data, ...(item.name === undefined ? {} : { name: item.name }) };
  });
}
