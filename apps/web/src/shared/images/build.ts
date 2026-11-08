import sharp from 'sharp';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { MANAGED_IMAGES, IMAGE_MAX_PIXELS, WEBP_QUALITY, checkImageBytes, checkImageDimensions } from '../../../../../packages/shared/src/images';

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
    const data = await encodeManagedImage(new URL(input, sourceRoot));
    if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error('Static image encoder did not produce WebP');
    }
    const target = new URL(output.slice(1), publicDir);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, data);
  }));
}

/** Apply the same limits to private build sources and their public WebP output. */
export async function encodeManagedImage(source: URL): Promise<Buffer> {
  checkImageBytes((await stat(source)).size);
  const bytes = await readFile(source);
  checkImageBytes(bytes.byteLength);
  const image = sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS });
  const metadata = await image.metadata();
  checkImageDimensions(metadata.width ?? 0, metadata.height ?? 0);
  const { data, info } = await image.webp({ lossless: true, quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
  checkImageDimensions(info.width, info.height);
  checkImageBytes(data.byteLength, true);
  return data;
}
