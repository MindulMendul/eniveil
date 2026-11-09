import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const visibleHtml = (html: string) => html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
test('built public home exposes one localized introduction and usable public links before JavaScript', async () => {
  for (const en of [false, true]) {
    const html = visibleHtml(await readFile(new URL(en ? '../dist/en/index.html' : '../dist/index.html', import.meta.url), 'utf8'));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(en ? '>Eniveil</h1>' : '>애니베일</h1>');
    expect(html).toContain(en ? 'Eniveil is an interactive mystery story platform.' : '애니베일은 혼자 사건을 조사하거나');
    for (const path of ['/about/', '/terms/', '/privacy/']) expect(html).toContain(`href="${en ? '/en' : ''}${path}"`);
    expect(html).not.toContain('type="password"');
  }
  const account = visibleHtml(await readFile(new URL('../dist/mypage/index.html', import.meta.url), 'utf8'));
  expect(account).not.toContain('id="entry-title"');
});
