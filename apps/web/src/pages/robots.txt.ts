import { siteOrigin } from '../shared/seo/metadata';
export function GET() {
  const origin = siteOrigin(import.meta.env.PUBLIC_SITE_URL);
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /mypage\nDisallow: /en/mypage\nDisallow: /workshop/editor\nDisallow: /en/workshop/editor\nSitemap: ${origin}/sitemap.xml\n`, {headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
