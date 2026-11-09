import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { MANAGED_IMAGES, managedImagePath, IMAGE_MAX_BYTES, IMAGE_MAX_OUTPUT_BYTES, checkImageDimensions } from '@festival/shared/images';
import { writeManagedImages, encodeManagedImage } from '../src/shared/images/build';
import { shareImage } from '../src/shared/seo/metadata';

test('unregistered, external and disguised image URLs cannot become page image sources', () => {
  for (const path of Object.values(MANAGED_IMAGES)) expect(managedImagePath(path)).toBe(path);
  for (const path of [undefined,null,'', '/images/a.webp', '/images/story-invitation.svg', 'https://example.com/a.webp','//example.com/a.webp','data:image/webp;base64,a','blob:foo', '/images/../favicon.webp','/favicon.webp?url=https://example.com/a.png']) expect(managedImagePath(path)).toBeNull();
});

test('every generated asset has actual WebP bytes and decodes to its intended dimensions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-webp-'));
  const base = pathToFileURL(directory + '/');
  try {
    await writeManagedImages(base);
    for (const path of Object.values(MANAGED_IMAGES)) {
      const data = await readFile(new URL(path.slice(1),base));
      expect(data.toString('ascii',0,4)).toBe('RIFF');
      expect(data.toString('ascii',8,12)).toBe('WEBP');
      const image = sharp(data);
      const info = await image.metadata();
      expect(data.byteLength).toBeLessThanOrEqual(IMAGE_MAX_OUTPUT_BYTES);
      checkImageDimensions(info.width!, info.height!);
      expect(info.format).toBe('webp');
      expect((await image.raw().toBuffer()).byteLength).toBeGreaterThan(0);
      if (path === MANAGED_IMAGES.invitation) expect([info.width,info.height]).toEqual([640,360]);
      if (path === MANAGED_IMAGES.ogKo || path === MANAGED_IMAGES.ogEn) expect([info.width,info.height]).toEqual([1200,630]);
    }
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('build rejects oversized source bytes, long narrow images and oversized encoded WebP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'image-limits-'));
  const source = pathToFileURL(join(directory, 'source'));
  try {
    await writeFile(source, Buffer.alloc(IMAGE_MAX_BYTES + 1));
    await expect(encodeManagedImage(source)).rejects.toThrow('size');
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" width="4097" height="1"/>');
    await expect(encodeManagedImage(source)).rejects.toThrow('dimensions');
    const png = await sharp(randomBytes(1024 * 1024 * 3), {raw:{width:1024,height:1024,channels:3}}).png().toBuffer();
    expect(png.byteLength).toBeLessThan(IMAGE_MAX_BYTES);
    await writeFile(source, png);
    await expect(encodeManagedImage(source)).rejects.toThrow('output-size');
  } finally { await rm(directory, {recursive:true,force:true}); }
});

test('localized share metadata points to managed WebP files and their actual MIME', () => {
  for (const en of [false,true]) {
    const image = shareImage(en,'https://example.com');
    expect(image.type).toBe('image/webp');
    expect(new URL(image.url).pathname).toBe(en?MANAGED_IMAGES.ogEn:MANAGED_IMAGES.ogKo);
  }
});
