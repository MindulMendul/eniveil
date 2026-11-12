import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';

test('quality telemetry starts only for full consent and drops data immediately after withdrawal',async()=>{
 const root=new URL('../src/',import.meta.url).pathname;
 const build=await Bun.build({entrypoints:['rum-consent-entry'],target:'browser',format:'cjs',define:{'import.meta.env.PUBLIC_FARO_COLLECTOR_URL':JSON.stringify('/telemetry/collect'),'import.meta.env.PUBLIC_RELEASE':JSON.stringify('test')},plugins:[{name:'isolated-faro',setup(builder){
  builder.onResolve({filter:/^rum-consent-entry$/},()=>({path:'entry',namespace:'test-entry'}));
  builder.onLoad({filter:/.*/,namespace:'test-entry'},()=>({contents:`export * from '${root}rum.ts'; export * from '${root}shared/analytics/consent.ts';`,loader:'ts',resolveDir:root}));
  builder.onResolve({filter:/^@grafana\/faro-/},()=>({path:'sdk',namespace:'faro-test'}));
  builder.onLoad({filter:/.*/,namespace:'faro-test'},()=>({contents:`export class ErrorsInstrumentation{};export class SessionInstrumentation{};export class ViewInstrumentation{};export class WebVitalsInstrumentation{};export class TracingInstrumentation{};export function initializeFaro(config){globalThis.configuration=config;globalThis.starts++;return{api:{pushEvent(){globalThis.sent++}},pause(){globalThis.pauses++},unpause(){}}}`,loader:'js'}));
 }}]});
 let scope='none';const handlers:Record<string,((event:any)=>void)[]>={};
 class CustomEvent{constructor(public type:string,public init:any={}){}get detail(){return this.init.detail}}
 const location={hostname:'eniveil.com',origin:'https://eniveil.com',reload:()=>context.reloads++};
 const context:any={module:{exports:{}},Date,CustomEvent,location,console,starts:0,sent:0,pauses:0,reloads:0,
  window:{location,addEventListener:(name:string,fn:any)=>(handlers[name]??=[]).push(fn),dispatchEvent:(e:CustomEvent)=>handlers[e.type]?.forEach(fn=>fn(e))},
  fetch:async()=>({ok:true,json:async()=>({consent:{version:2,scope,updatedAt:new Date().toISOString(),accountId:null}})})};
 runInNewContext(await build.outputs[0]!.text(),context);const api=context.module.exports;
 api.initRUM();api.rumEvent('blocked');expect(context.starts).toBe(0);
 scope='basic';await api.syncCollectionConsent();api.initRUM();expect(context.starts).toBe(0);
 scope='full';await api.syncCollectionConsent();expect(context.starts).toBe(1);expect(context.sent).toBe(1);
 const sanitized=context.configuration.beforeSend({meta:{user:{id:'private'},page:{url:'https://eniveil.com/?room=SECRET'}}});expect(sanitized.meta).toEqual({page:{url:'https://eniveil.com/'}});
 scope='none';await api.syncCollectionConsent();const before=context.sent;api.rumEvent('blocked');expect(context.sent).toBe(before);expect(context.configuration.beforeSend({meta:{}})).toBeNull();expect(context.pauses).toBeGreaterThan(0);expect(context.reloads).toBe(1);
});
