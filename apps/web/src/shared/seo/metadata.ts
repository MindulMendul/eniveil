import { legalContact, siteOperator } from '../lib/site-identity';
import { MANAGED_IMAGES } from '@festival/shared/images';
export const publicPaths = ['/', '/workshop/', '/terms/', '/privacy/', '/about/'];
export function shareImage(en: boolean, origin: string) {
  return {
    url: new URL(en ? MANAGED_IMAGES.ogEn : MANAGED_IMAGES.ogKo, origin).href,
    alt: en ? 'Eniveil — discover and play interactive mystery stories.' : '애니베일 — 추리 이야기를 발견하고 플레이하세요.',
    width: '1200', height: '630', type: 'image/webp',
  };
}
export function siteOrigin(value?: string) {
  const url = new URL(value || 'https://eniveil.com');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('PUBLIC_SITE_URL must be an HTTP(S) origin.');
  return url.origin;
}
export function indexingAllowed(value?: string) {
  return value !== 'false';
}
export function pageMetadata(pathname: string) {
  const en = /^\/en(?:\/|$)/.test(pathname);
  const path = pathname.replace(/^\/en(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const brand = en ? 'Eniveil' : '애니베일';
  const pages: Record<string, [string, string]> = en ? {
    '/about': ['About', 'Learn how to discover and play interactive mystery stories on Eniveil.'],
    '/': ['Interactive Stories', 'Discover interactive mystery stories to enjoy alone or with friends. Explore community stories.'],
    '/workshop': ['Workshop', 'Explore community mystery stories and save your favorites.'],
    '/terms': ['Terms of Service', 'Read the terms for using Eniveil and its interactive story platform.'],
    '/privacy': ['Privacy Policy', 'Learn how Eniveil handles account information, guest sessions and service data.'],
    '/mypage': ['My page', 'Manage your account and stories.'],
    '/workshop/editor': ['Story editor', 'Create and edit your private story drafts.'],
  } : {
    '/about': ['서비스 소개', '애니베일에서 인터랙티브 추리 작품을 찾고 플레이하는 방법을 소개합니다.'],
    '/': ['인터랙티브 작품', '혼자 또는 친구와 즐기는 인터랙티브 추리 이야기를 만나세요. 창작마당에서 다양한 작품을 찾을 수 있습니다.'],
    '/workshop': ['창작마당', '다른 제작자의 추리 작품을 둘러보고 즐겨찾기에 저장하세요.'],
    '/terms': ['이용약관', '애니베일의 인터랙티브 작품과 서비스 이용에 관한 약관을 확인하세요.'],
    '/privacy': ['개인정보 처리방침', '애니베일의 계정 정보, 게스트 세션과 서비스 데이터 처리 방침을 확인하세요.'],
    '/mypage': ['마이페이지', '계정과 내가 만든 작품을 관리합니다.'],
    '/workshop/editor': ['스토리 편집기', '비공개 스토리 초안을 만들고 수정합니다.'],
  };
  const [name, description] = pages[path] ?? [en ? 'Page not found' : '페이지를 찾을 수 없음', en ? 'This page is not available.' : '요청한 페이지를 찾을 수 없습니다.'];
  const indexable = publicPaths.includes(path === '/' ? '/' : path + '/');
  const localized = (language: string) => `${language === 'en' ? '/en' : ''}${path === '/' ? '/' : path + '/'}`;
  return { title: `${name} · ${brand}`, description, brand, en, path, indexable, localized };
}

export function pageSchema(pathname: string, origin: string) {
  const meta = pageMetadata(pathname);
  if (!meta.indexable) return null;
  const url = new URL(meta.localized(meta.en ? 'en' : 'ko'), origin).href;
  const website = new URL(meta.en ? '/en/' : '/', origin).href + '#website';
  return {
    '@context': 'https://schema.org',
    '@type': meta.path === '/' ? 'WebSite' : meta.path === '/workshop' ? 'CollectionPage' : meta.path === '/about' ? 'AboutPage' : 'WebPage',
    '@id': meta.path === '/' ? website : url + '#webpage',
    name: meta.title, description: meta.description, url,
    inLanguage: meta.en ? 'en' : 'ko',
    publisher: {
      '@type': 'Person', '@id': new URL('/#operator', origin).href,
      name: siteOperator, url: new URL('/', origin).href,
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: legalContact },
    },
    ...(meta.path === '/' ? {} : { isPartOf: { '@id': website } }),
  };
}

export function serializeSchema(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function crawlerGuide(origin: string) {
  return `# Eniveil · 애니베일

> Interactive mystery stories to discover and play.
> 인터랙티브 추리 작품을 탐색하고 플레이하는 플랫폼입니다.

Public pages are available in Korean and English. Sign in to play.
Private drafts, accounts and role secrets are not public content.

## 한국어
${publicPaths.map(path => `- [${pageMetadata(path).title}](${new URL(path, origin).href})`).join('\n')}

## English
${publicPaths.map(path => `- [${pageMetadata('/en' + path).title}](${new URL('/en' + path, origin).href})`).join('\n')}
`;
}
