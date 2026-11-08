/** Only centrally generated assets are eligible for page images. */
export const MANAGED_IMAGES = {
  invitation: '/images/story-invitation.webp',
  favicon: '/favicon.webp',
  ogKo: '/og/story-archive-ko-v2.webp',
  ogEn: '/og/story-archive-en-v2.webp',
} as const;
const managedPaths = new Set<string>(Object.values(MANAGED_IMAGES));
export function managedImagePath(value: unknown): string | null {
  return typeof value === 'string' && managedPaths.has(value) ? value : null;
}
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_OUTPUT_BYTES = 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 4096;
export const IMAGE_MAX_PIXELS = 16_000_000;
export const WEBP_QUALITY = 82;

/** Validate metadata before allocating decoded pixels, and again after decoding. */
export function checkImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0 || width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION
    || width * height > IMAGE_MAX_PIXELS) throw new Error('dimensions');
}

export function checkImageBytes(size: number, output = false): void {
  const limit = output ? IMAGE_MAX_OUTPUT_BYTES : IMAGE_MAX_BYTES;
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new Error(output ? 'output-size' : 'size');
}
