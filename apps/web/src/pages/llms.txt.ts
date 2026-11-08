import { crawlerGuide, siteOrigin } from '../shared/seo/metadata';
export function GET() {
  return new Response(crawlerGuide(siteOrigin(import.meta.env.PUBLIC_SITE_URL)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
