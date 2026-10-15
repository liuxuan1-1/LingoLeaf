import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import type { ImageInput } from '../shared/types';
import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from '../shared/attachments';
import { inspectImage } from '../shared/image-metadata';
import { useI18n } from './i18n';

export class AttachmentError extends Error {
  constructor(public code: 'count' | 'size' | 'total' | 'format' | 'dimensions' | 'read') { super(code); }
}
export function imageByteLength(image: ImageInput): number {
  return image.data.length * 3 / 4 - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0);
}
/** Validate the whole batch before returning it; a failed paste never silently drops files. */
export async function readImageFiles(files: File[], existing: ImageInput[] = []): Promise<ImageInput[]> {
  if (files.length + existing.length > MAX_IMAGES) throw new AttachmentError('count');
  if (files.some((file) => file.size > MAX_IMAGE_BYTES)) throw new AttachmentError('size');
  if (files.reduce((sum, file) => sum + file.size, existing.reduce((sum, image) => sum + imageByteLength(image), 0)) > MAX_TOTAL_IMAGE_BYTES) throw new AttachmentError('total');
  const added: ImageInput[] = [];
  for (const file of files) {
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new AttachmentError('format');
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { throw new AttachmentError('read'); }
    let metadata: ReturnType<typeof inspectImage>;
    try { metadata = inspectImage(bytes); } catch (error) { throw new AttachmentError(error && typeof error === 'object' && 'code' in error && error.code === 'dimensions' ? 'dimensions' : 'format'); }
    if (file.type && file.type !== metadata.mimeType) throw new AttachmentError('format');
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new AttachmentError('dimensions');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    added.push({ mimeType: metadata.mimeType, data: btoa(binary), name: file.name.slice(0, 200) || undefined });
  }
  return [...existing, ...added];
}

export function useImageInput({ images, onChange, onError, disabled = false, scope }: {
  images: ImageInput[]; onChange: (images: ImageInput[]) => void; onError: (message: string) => void; disabled?: boolean; scope?: unknown;
}) {
  const { t } = useI18n();
  const [reading, setReading] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const addFiles = async (files: File[]) => {
    if (!files.length || disabled || inFlight.current) return;
    const startedScope = scope;
    inFlight.current = true; setReading(true); onError('');
    try {
      const next = await readImageFiles(files, images);
      if (alive.current && currentScope.current === startedScope) onChange(next);
    } catch (error) {
      const messages = {
        count: t('最多添加 4 张图片，请移除一些图片后再试。', 'Add up to 4 images. Remove an image before trying again.'),
        size: t('每张图片不能超过 5 MB。', 'Each image must be 5 MB or smaller.'),
        total: t('图片总大小不能超过 12 MB。', 'The total image size must be 12 MB or smaller.'),
        format: t('无法读取图片。请选择有效的 PNG、JPEG 或 WebP 文件。', 'Cannot read this image. Choose a valid PNG, JPEG or WebP file.'),
        dimensions: t('图片每边不能超过 8192 像素，总像素不能超过 2400 万。', 'Images must be at most 8192 pixels per side and 24 megapixels in total.'),
        read: t('图片读取失败，请重新选择或粘贴。', 'The image could not be read. Select or paste it again.'),
      };
      if (alive.current && currentScope.current === startedScope) onError(messages[error instanceof AttachmentError ? error.code : 'read']);
    } finally { inFlight.current = false; if (alive.current) setReading(false); }
  };
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length) { event.preventDefault(); void addFiles(files); }
  };
  return { addFiles, onPaste, reading };
}

export function ImagePreviews({ images, onRemove, disabled = false }: {
  images: ImageInput[]; onRemove?: (index: number) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  if (!images.length) return null;
  return <div className="image-previews">{images.map((image, index) => <figure className="image-preview" key={`${index}-${image.data.slice(-24)}`}>
    <img src={`data:${image.mimeType};base64,${image.data}`} alt={t('附件图片 {count}', 'Attached image {count}', { count: index + 1 })} />
    <figcaption title={image.name}>{image.name || t('图片 {count}', 'Image {count}', { count: index + 1 })}</figcaption>
    {onRemove && <button type="button" className="icon-button image-remove" disabled={disabled} onClick={() => onRemove(index)} aria-label={t('移除图片 {count}', 'Remove image {count}', { count: index + 1 })}><X size={15} /></button>}
  </figure>)}</div>;
}

export function ImageAttachments({ images, onRemove, addFiles, disabled = false, reading = false }: {
  images: ImageInput[]; onRemove: (index: number) => void; addFiles: (files: File[]) => Promise<void>; disabled?: boolean; reading?: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return <div className="image-attachments">
    <ImagePreviews images={images} onRemove={onRemove} disabled={disabled || reading} />
    <div className="image-attachment-actions">
      <button type="button" className="button secondary small" disabled={disabled || reading || images.length >= MAX_IMAGES} onClick={() => input.current?.click()}>
        {reading ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}{reading ? t('正在读取图片…', 'Reading images…') : t('添加图片', 'Add images')}
      </button>
      <small>{t('可粘贴截图 · PNG / JPEG / WebP · 最多 4 张', 'Paste screenshots · PNG / JPEG / WebP · Up to 4 images')}</small>
    </div>
    <input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label={t('选择图片文件', 'Choose image files')} accept="image/png,image/jpeg,image/webp" multiple disabled={disabled || reading}
      onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles(files); }} />
  </div>;
}
