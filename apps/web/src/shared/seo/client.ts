import { pageMetadata, pageSchema, serializeSchema, shareImage, siteOrigin } from './metadata';
export function syncMetadata(pathname: string) {
  window.dispatchEvent(new Event('site:navigation'));
  const m = pageMetadata(pathname), origin = siteOrigin(import.meta.env.PUBLIC_SITE_URL);
  const url = new URL(m.localized(m.en ? 'en' : 'ko'), origin).href;
  document.head.querySelectorAll('[data-site-meta]').forEach(node => node.remove());
  function add(tag: string, attrs: Record<string,string>, text?: string) {
    const node = document.createElement(tag);
    node.setAttribute('data-site-meta', '');
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    if (text) node.textContent = text;
    document.head.append(node);
  }
  const meta = (name:string,content:string,property=false) => add('meta',{[property?'property':'name']:name,content});
  meta('description',m.description); meta('robots',m.indexable?'index,follow':'noindex,nofollow');
  if (!m.indexable) return;
  add('link',{rel:'canonical',href:url});
  for (const lang of ['ko','en','x-default']) add('link',{rel:'alternate',hreflang:lang,href:new URL(m.localized(lang==='en'?'en':'ko'),origin).href});
  for (const [key,value] of Object.entries({type:'website',site_name:m.brand,title:m.title,description:m.description,url,locale:m.en?'en_US':'ko_KR','locale:alternate':m.en?'ko_KR':'en_US'})) meta('og:'+key,value,true);
  const image = shareImage(m.en, origin);
  for (const [key, value] of Object.entries({image: image.url, 'image:type': image.type, 'image:width': image.width, 'image:height': image.height, 'image:alt': image.alt})) meta('og:' + key, value, true);
  meta('twitter:card','summary_large_image'); meta('twitter:title',m.title);meta('twitter:description',m.description);
  meta('twitter:image',image.url); meta('twitter:image:alt',image.alt);
  add('script',{type:'application/ld+json'},serializeSchema(pageSchema(pathname, origin)));
}
