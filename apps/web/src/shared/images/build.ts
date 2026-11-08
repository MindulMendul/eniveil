import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { MANAGED_IMAGES, IMAGE_MAX_PIXELS, WEBP_QUALITY } from '../../../../../packages/shared/src/images';

const sourceRoot = new URL('../../../assets/images/', import.meta.url);
const assets = [
  ['story-invitation.svg', MANAGED_IMAGES.invitation],
  ['favicon.png', MANAGED_IMAGES.favicon],
  ['story-archive-ko.png', MANAGED_IMAGES.ogKo],
  ['story-archive-en.png', MANAGED_IMAGES.ogEn],
] as const;

/** Source art is private to the build; only actual WebP bytes enter public/. */
export function managedWebpAssets(): AstroIntegration {
  return {
    name: 'managed-webp-assets',
    hooks: {
      'astro:config:setup': async ({ config }) => {
        await writeManagedImages(config.publicDir);
      },
    },
  };
}

export async function writeManagedImages(publicDir: URL) {
  await Promise.all(assets.map(async ([input, output]) => {
    const data = await sharp(fileURLToPath(new URL(input, sourceRoot)), { limitInputPixels: IMAGE_MAX_PIXELS })
      .webp({ lossless: true, quality: WEBP_QUALITY }).toBuffer();
    if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error('Static image encoder did not produce WebP');
    }
    const target = new URL(output.slice(1), publicDir);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, data);
  }));
}
