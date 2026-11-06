export const MAX_IMAGE_PIXELS = 16_000_000;

export function webpFilename(name: string): string {
  return `${name.replace(/\.[^.]*$/, '') || 'image'}.webp`;
}


export function checkDimensions(width: number, height: number) {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw Error('dimensions');
}

/** Bounded metadata scan, before a decoder can allocate an oversized bitmap. */
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const u24 = (offset: number) => bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16);
  if (mime === 'image/png' && bytes.length >= 24 && bytes[0] === 137 && tag(1, 7) === 'PNG\r\n\x1a\n' && tag(12, 4) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/gif' && bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(tag(0, 6))) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 20 && tag(0, 4) === 'RIFF' && tag(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = tag(offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > bytes.length && kind !== 'VP8 ' && kind !== 'VP8L') break;
      if (kind === 'VP8X' && length >= 10 && start + 10 <= bytes.length) return { width: u24(start + 4) + 1, height: u24(start + 7) + 1 };
      if (kind === 'VP8L' && length >= 5 && start + 5 <= bytes.length && bytes[start] === 47) {
        const packed = view.getUint32(start + 1, true);
        return { width: (packed & 16383) + 1, height: ((packed >>> 14) & 16383) + 1 };
      }
      if (kind === 'VP8 ' && length >= 10 && start + 10 <= bytes.length && bytes[start + 3] === 157 && bytes[start + 4] === 1 && bytes[start + 5] === 42) {
        return { width: view.getUint16(start + 6, true) & 16383, height: view.getUint16(start + 8, true) & 16383 };
      }
      offset = start + length + (length % 2);
    }
  }
  throw Error('format');
}
