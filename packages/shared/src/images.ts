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
export const IMAGE_MAX_PIXELS = 16_000_000;
export const WEBP_QUALITY = 82;
