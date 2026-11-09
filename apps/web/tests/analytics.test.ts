import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';

async function analytics(id: string, stored: string | null = null, options: { failSet?: boolean; failRemove?: boolean } = {}) {
  const bundle = await Bun.build({entrypoints:[new URL('../src/analytics.js',import.meta.url).pathname],target:'browser',format:'cjs',define:{'import.meta.env.PUBLIC_GTM_CONTAINER_ID':JSON.stringify(id)}});
  const scripts: any[] = [], listeners: Record<string,(event?: any)=>void> = {}; let reloads = 0;
  const location = {pathname:'/',origin:'https://example.com',search:'?code=SECRET',hash:'#SECRET',reload:()=>{reloads++}};
  const window: any = {location,addEventListener:(name:string,fn:(event?: any)=>void)=>listeners[name]=fn};
  const context = {module:{exports:{} as any},window,document:{title:'Private title',hidden:false,addEventListener:(name:string,fn:(event?: any)=>void)=>listeners[name]=fn,createElement:()=>({}),head:{append:(s:any)=>scripts.push(s)}},localStorage:{getItem:()=>stored,setItem:(_key:string,value:string)=>{if(options.failSet) throw Error('storage'); stored=value},removeItem:()=>{if(options.failRemove) throw Error('storage'); stored=null}},Date};
  runInNewContext(await bundle.outputs[0]!.text(),context);
  return {api:context.module.exports,window,scripts,listeners,reloads:()=>reloads,stored:()=>stored};
}

test('GTM never loads or emits before consent; granting loads once and sanitizes SPA pages', async()=>{
 const {api,window,scripts}=await analytics('GTM-56Q5K95G');
 expect(api.initializeAnalytics()).toBe(false);api.trackPageView('ko');api.trackEvent('story_start');expect(scripts).toHaveLength(0);expect(window.dataLayer).toBeUndefined();
 api.setAnalyticsConsent('granted');api.initializeAnalytics();expect(scripts).toHaveLength(1);expect(scripts[0].src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-56Q5K95G');
 api.trackPageView('ko');expect(window.dataLayer.filter((e:any)=>e.event==='page_view')).toHaveLength(1);
 window.location.pathname='/en/workshop';api.trackPageView('en');
 const page=window.dataLayer.at(-1);expect(page.page_location).toBe('https://example.com/en/workshop');expect(page.page_referrer).toBe('');expect(page.page_title).toBe('/en/workshop');expect(page.language).toBe('en');
 api.trackEvent('story_start',{story_id:'public-story',language:'en',answer:'SECRET',email:'private@example.com',clue_id:'SECRET-CLUE',suspect_id:'SECRET-SUSPECT',location_id:'SECRET-LOCATION'});
 expect(window.dataLayer.at(-1)).toEqual({event:'story_start',story_id:'public-story',language:'en'});
 expect(JSON.stringify(window.dataLayer)).not.toContain('SECRET');expect(window.gtag).toBeUndefined();
});

test('missing/invalid containers and denied consent cannot initialize; saved consent can', async()=>{
 for(const id of ['', 'G-OLD', 'GTM-<script>']){const {api,scripts}=await analytics(id,'granted');expect(api.initializeAnalytics()).toBe(false);expect(scripts).toHaveLength(0)}
 const denied=await analytics('GTM-56Q5K95G','denied');expect(denied.api.initializeAnalytics()).toBe(false);
 const allowed=await analytics('GTM-56Q5K95G','granted');expect(allowed.api.initializeAnalytics()).toBe(true);expect(allowed.scripts).toHaveLength(1);
});


test('withdrawal stops events and reloads other tabs', async()=>{
 const current=await analytics('GTM-56Q5K95G','granted');current.api.initializeAnalytics();
 current.listeners.storage({key:'analytics-consent-v1',newValue:'denied'});
 expect(current.reloads()).toBe(1);const before=current.window.dataLayer.length;
 current.api.trackEvent('story_start',{story_id:'x'});expect(current.window.dataLayer).toHaveLength(before);
});

test('storage failures do not silently restore a prior grant', async()=>{
 const blocked=await analytics('GTM-56Q5K95G','granted',{failSet:true,failRemove:true});
 blocked.api.initializeAnalytics();const before=blocked.window.dataLayer.length;
 expect(blocked.api.setAnalyticsConsent('denied')).toBe(false);expect(blocked.reloads()).toBe(0);
 blocked.api.trackEvent('story_start',{story_id:'x'});expect(blocked.window.dataLayer).toHaveLength(before);
 const fallback=await analytics('GTM-56Q5K95G','granted',{failSet:true});fallback.api.initializeAnalytics();
 expect(fallback.api.setAnalyticsConsent('denied')).toBe(true);expect(fallback.stored()).toBeNull();expect(fallback.reloads()).toBe(1);
 const grant=await analytics('GTM-56Q5K95G',null,{failSet:true});expect(grant.api.setAnalyticsConsent('granted')).toBe(false);expect(grant.scripts).toHaveLength(0);
});


test('withdrawal does not send a final dwell event during pagehide', async()=>{
 const current=await analytics('GTM-56Q5K95G','granted');current.api.initializeAnalytics();
 await new Promise(resolve=>setTimeout(resolve,1050));
 expect(current.api.setAnalyticsConsent('denied')).toBe(true);
 const before=current.window.dataLayer.length;current.listeners.pagehide();
 expect(current.window.dataLayer).toHaveLength(before);expect(current.reloads()).toBe(1);
});
