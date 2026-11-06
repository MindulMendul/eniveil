export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;

/** Converts locally; verifies actual encoder output rather than renaming a PNG fallback. */
export async function convertToWebp(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw Error('format');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('size');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) throw Error('dimensions');
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

export function webpFilename(name: string): string {
  return `${name.replace(/\.[^.]*$/, '') || 'image'}.webp`;
}
