import { expect, test } from 'bun:test';
import { checkDimensions, imageDimensions, webpFilename } from '../src/features/image-converter/headers';

test('oversized metadata rejects before decoding; wrong headers reject safely', async () => {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
  const view = new DataView(bytes.buffer);view.setUint32(16,100_000);view.setUint32(20,100_000);
  const dimensions = imageDimensions(bytes, 'image/png');
  expect(() => checkDimensions(dimensions.width, dimensions.height)).toThrow('dimensions');
  for (const mime of ['image/png','image/jpeg','image/gif','image/webp']) expect(() => imageDimensions(new Uint8Array(4),mime)).toThrow('format');
  expect(webpFilename('name.photo.jpg')).toBe('name.photo.webp');
});

test('PNG, GIF, JPEG, WebP VP8X/VP8L/VP8 metadata dimensions', () => {
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12);new DataView(png.buffer).setUint32(16,80);new DataView(png.buffer).setUint32(20,60);
  expect(imageDimensions(png,'image/png')).toEqual({width:80,height:60});
  const gif=new Uint8Array([71,73,70,56,57,97,80,0,60,0]);expect(imageDimensions(gif,'image/gif')).toEqual({width:80,height:60});
  const jpg=new Uint8Array([255,216,255,192,0,8,8,0,60,0,80,0]);expect(imageDimensions(jpg,'image/jpeg')).toEqual({width:80,height:60});
  for(const kind of ['VP8X','VP8L','VP8 ']) {
    const bytes=new Uint8Array(30);const view=new DataView(bytes.buffer);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WEBP'+kind),8);view.setUint32(16,10,true);
    if(kind==='VP8X'){bytes[24]=79;bytes[27]=59;}
    if(kind==='VP8L'){bytes[20]=47;view.setUint32(21,79+(59<<14),true);}
    if(kind==='VP8 '){bytes.set([157,1,42],23);view.setUint16(26,80,true);view.setUint16(28,60,true);}
    expect(imageDimensions(bytes,'image/webp')).toEqual({width:80,height:60});
  }
});
