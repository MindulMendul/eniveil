import { expect, test } from 'bun:test';
import { crawlerGuide, pageMetadata, pageSchema, publicPaths, serializeSchema, siteOrigin } from '../src/shared/seo/metadata';

test('blank site URL uses the same default as an unset URL while invalid origins remain rejected', () => {
  expect(siteOrigin('')).toBe(siteOrigin());
  expect(siteOrigin('https://example.com/')).toBe('https://example.com');
  for (const origin of ['invalid', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?x=1', 'javascript:alert(1)']) {
    expect(() => siteOrigin(origin)).toThrow();
  }
});

test('public schemas match canonical/locale in each environment and exclude private pages', () => {
  for (const origin of ['https://production.example', 'https://qa.example']) {
    const ids = new Set<string>();
    const websites: string[] = [];
    for (const prefix of ['', '/en']) for (const path of publicPaths) {
      const schema = pageSchema(prefix + path, origin)!;
      expect(ids.has(schema['@id'])).toBe(false);
      ids.add(schema['@id']);
      if (schema['@type'] === 'WebSite') websites.push(schema['@id']);
      const meta = pageMetadata(prefix + path);
      expect(schema.url).toBe(new URL(meta.localized(prefix ? 'en' : 'ko'), origin).href);
      expect(schema.inLanguage).toBe(prefix ? 'en' : 'ko');
      expect(schema['@id']).toStartWith(schema.url);
      expect(schema.name).toBe(meta.title);
      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe(path === '/' ? 'WebSite' : path === '/workshop/' ? 'CollectionPage' : path === '/about/' ? 'AboutPage' : 'WebPage');
    }
    expect(ids.size).toBe(publicPaths.length * 2);
    expect(websites).toEqual([origin + '/#website', origin + '/en/#website']);
    for (const path of ['/mypage', '/workshop/editor', '/404', '/unknown', '/en/mypage']) expect(pageSchema(path, origin)).toBeNull();
    const guide = crawlerGuide(origin);
    for (const path of publicPaths) expect(guide).toContain(new URL(path, origin).href);
    expect(guide).not.toContain('/mypage');
  }
});

test('structured data safely round-trips closing script tags and special characters', () => {
  const data = { name: '</script><script>alert(1)</script> & "한글"' };
  const serialized = serializeSchema(data);
  expect(serialized).not.toContain('<');
  expect(JSON.parse(serialized)).toEqual(data);
});
