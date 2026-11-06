export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
import { checkDimensions, imageDimensions } from './headers';

/** Converts locally; verifies actual encoder output rather than renaming a PNG fallback. */
export async function convertToWebp(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw Error('format');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('size');
  // JPEG metadata may span many APP segments before SOF. The file-size check bounds this
  // scan to 10 MiB while still rejecting oversized dimensions before bitmap decoding.
  const headerBytes = file.type === 'image/jpeg' ? file.size : 256 * 1024;
  const dimensions = imageDimensions(new Uint8Array(await file.slice(0, headerBytes).arrayBuffer()), file.type);
  checkDimensions(dimensions.width, dimensions.height);
  const bitmap = await createImageBitmap(file);
  try {
    checkDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw Error('unsupported');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('encode')), 'image/webp', 0.82));
    if (blob.type !== 'image/webp') throw Error('unsupported');
    return blob;
  } finally { bitmap.close(); }
}
