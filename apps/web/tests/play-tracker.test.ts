import {expect,test} from 'bun:test';
import {playTracker} from '../src/shared/lib/play-tracker';

test('page exit attempts every queued batch when browser storage fails',async()=>{
 const original=new Map<string,PropertyDescriptor|undefined>();
 const set=(key:string,value:unknown)=>{original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 const handlers=new Map<string,()=>void>();const batches:Blob[]=[];
 set('window',{addEventListener:(event:string,fn:()=>void)=>handlers.set(event,fn),removeEventListener:()=>{}});
 set('document',{hidden:false,addEventListener:()=>{},removeEventListener:()=>{}});
 set('sessionStorage',{getItem:()=>null,setItem:()=>{throw Error('storage disabled');}});
 set('navigator',{sendBeacon:(_url:string,body:Blob)=>{batches.push(body);return true;}});
 set('fetch',async()=>{throw Error('offline');});
 let tracker:ReturnType<typeof playTracker>|undefined;
 try{
  tracker=playTracker('offline');for(let i=0;i<120;i++)tracker.record('click',String(i));
  await tracker.flush();handlers.get('pagehide')!();handlers.get('pagehide')!();
  const events=(await Promise.all(batches.map(async b=>JSON.parse(await b.text()).events))).flat();
  expect(batches.length).toBe(3);expect(events.length).toBe(121);
  expect(new Set(events.map(e=>e.id)).size).toBe(121);expect(events.filter(e=>e.type==='exit').length).toBe(1);
 }finally{tracker?.stop();for(const[key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
