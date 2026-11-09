import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
async function analytics(id='GTM-56Q5K95G') {
 const bundle=await Bun.build({entrypoints:[new URL('../src/analytics.js',import.meta.url).pathname],target:'browser',format:'cjs',define:{'import.meta.env.PUBLIC_GTM_CONTAINER_ID':JSON.stringify(id)}});
 const scripts:any[]=[],listeners:Record<string,((e:any)=>void)[]>={};let stored:any=null,reloads=0,fail=false,persist=true;
 const on=(name:string,fn:(e:any)=>void)=>{(listeners[name]??=[]).push(fn)};
 class CustomEvent {constructor(public type:string,public options:any={}){}get detail(){return this.options.detail}}
 const window:any={location:{pathname:'/',origin:'https://example.com',reload:()=>reloads++},addEventListener:on,dispatchEvent:(e:CustomEvent)=>listeners[e.type]?.forEach(fn=>fn(e))};
 const context={module:{exports:{} as any},window,CustomEvent,Date,
  localStorage:{getItem:()=> 'granted',setItem:()=>{throw Error('blocked')}},
  document:{hidden:false,addEventListener:on,createElement:()=>({}),head:{append:(s:any)=>scripts.push(s)}},
  fetch:async(_url:string,init:any={})=>{if(fail)throw Error('network');if(init.method==='POST'){const b=JSON.parse(init.body);const value={...b,updatedAt:new Date().toISOString(),accountId:null};if(persist)stored=value;return{ok:true,json:async()=>({consent:value})}}return{ok:true,json:async()=>({consent:stored})}}
 };
 runInNewContext(await bundle.outputs[0]!.text(),context);
 return{api:context.module.exports,window,scripts,reloads:()=>reloads,setFail:(v:boolean)=>fail=v,setPersist:(v:boolean)=>persist=v};
}

test('legacy grant is not expanded; explicit basic enables one GTM and sanitizes events',async()=>{
 const f=await analytics();expect(f.api.initializeAnalytics()).toBe(false);await f.api.syncCollectionConsent();expect(f.api.initializeAnalytics()).toBe(false);
 await f.api.saveCollectionConsent('basic');expect(f.api.initializeAnalytics()).toBe(true);f.api.initializeAnalytics();expect(f.scripts).toHaveLength(1);
 f.api.trackPageView('ko');expect(f.window.dataLayer.filter((e:any)=>e.event==='page_view')).toHaveLength(1);
 f.window.location.pathname='/en/';f.api.trackPageView('en');expect(f.window.dataLayer.at(-1).page_location).toBe('https://example.com/en/');
 f.api.trackEvent('story_start',{story_id:'story',language:'en',answer:'SECRET',email:'SECRET',clue_id:'SECRET'});
 expect(f.window.dataLayer.at(-1)).toEqual({event:'story_start',story_id:'story',language:'en'});expect(JSON.stringify(f.window.dataLayer)).not.toContain('SECRET');
 expect(f.api.collectionConsent().scope).toBe('basic');expect(f.window.gtag).toBeUndefined();
 const before=f.window.dataLayer.length;f.api.trackEvent('ad_click',{campaign_id:'marketing'});expect(f.window.dataLayer).toHaveLength(before);
 expect(f.window.dataLayer[0][2]).toMatchObject({ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
});

test('full to basic preserves GA; withdrawal immediately blocks events and unloads external tags',async()=>{
 const f=await analytics();await f.api.saveCollectionConsent('full');f.api.initializeAnalytics();expect(f.api.collectionConsent().scope).toBe('full');
 await f.api.saveCollectionConsent('basic');expect(f.reloads()).toBe(0);expect(f.api.collectionConsent().scope).toBe('basic');
 await f.api.saveCollectionConsent('none');const before=f.window.dataLayer.length;f.api.trackEvent('story_start');expect(f.window.dataLayer).toHaveLength(before);expect(f.reloads()).toBe(1);
});

test('unavailable server or blocked preference cookie never produces a grant; local cache is not authoritative',async()=>{
 const f=await analytics();f.setFail(true);await expect(f.api.saveCollectionConsent('full')).rejects.toThrow('network');expect(f.api.initializeAnalytics()).toBe(false);
 f.setFail(false);f.setPersist(false);await expect(f.api.saveCollectionConsent('full')).rejects.toThrow('consent-storage');expect(f.api.initializeAnalytics()).toBe(false);expect(f.scripts).toHaveLength(0);
});

test('scope choices remain usable without a configured GTM container',async()=>{
 for(const id of ['', 'G-OLD','GTM-<script>']){const f=await analytics(id);await f.api.saveCollectionConsent('full');expect(f.api.initializeAnalytics()).toBe(false);expect(f.api.collectionConsent().scope).toBe('full');expect(f.scripts).toHaveLength(0)}
});


test('background account/connection refresh cannot invalidate an in-flight explicit choice',async()=>{
 const f=await analytics();await f.api.saveCollectionConsent('full');f.api.initializeAnalytics();
 const choice=f.api.saveCollectionConsent('basic');const background=f.api.syncCollectionConsent(true);
 await Promise.all([choice,background]);expect(f.api.collectionConsent().scope).toBe('basic');expect(f.reloads()).toBe(0);expect(f.scripts).toHaveLength(1);
});
