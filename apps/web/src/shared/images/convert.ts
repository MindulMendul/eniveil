import { IMAGE_MAX_BYTES, WEBP_QUALITY } from '@festival/shared/images';
export const MAX_IMAGE_BYTES = IMAGE_MAX_BYTES;
import { checkDimensions, imageDimensions, jpegDimensions } from './headers';

/** Converts locally; verifies actual encoder output rather than renaming a PNG fallback. */
export async function convertToWebp(file: Blob): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('format');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('size');
  const dimensions = file.type === 'image/jpeg' ? await jpegDimensions(file)
    : imageDimensions(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), file.type);
  checkDimensions(dimensions.width, dimensions.height);
  const bitmap = await createImageBitmap(file);
  try {
    checkDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('unsupported');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('encode'));
      }, 'image/webp', WEBP_QUALITY / 100);
    });
    if (blob.type !== 'image/webp') throw new Error('unsupported');
    return blob;
  } finally { bitmap.close(); }
}
