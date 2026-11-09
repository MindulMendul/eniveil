import { indexingAllowed, siteOrigin } from '../shared/seo/metadata';
export function GET() {
  const origin = siteOrigin(import.meta.env.PUBLIC_SITE_URL);
  return new Response(!indexingAllowed(import.meta.env.PUBLIC_INDEXABLE) ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, {headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
