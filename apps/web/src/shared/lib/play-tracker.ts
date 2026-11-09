import type { PlayEvent } from '@festival/shared';
export function playTracker(id:string) {
  const key=`play-events:${id}`;
  let queue:PlayEvent[]=[];let sequence=0;let clientId=crypto.randomUUID();let stopped=false;
  try {const saved=JSON.parse(sessionStorage.getItem(key)??'{}');queue=Array.isArray(saved.events)?saved.events:[];clientId=typeof saved.clientId==='string'?saved.clientId:clientId;sequence=Number.isSafeInteger(saved.sequence)?saved.sequence:0;} catch { /* Invalid browser cache cannot affect authoritative results. */ }
  let stage:PlayEvent['stage']='intro';
  const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify({events:queue,sequence,clientId}));}catch{/* Storage disabled: live delivery still works. */}};
  let inFlight:Promise<boolean>|null=null;
  async function flush():Promise<boolean> {
    if(inFlight)return inFlight;
    if(stopped)return queue.length===0;
    inFlight=(async()=>{
      while(queue.length&&!stopped){
        const batch=queue.slice(0,50);
        try {
          const response=await fetch(`/api/play/sessions/${id}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true});
          if(!response.ok)return false;
          const sent=new Set(batch.map(e=>e.id));queue=queue.filter(e=>!sent.has(e.id));persist();
        }catch{return false;}
      }
      return queue.length===0;
    })();
    try{return await inFlight;}finally{inFlight=null;}
  }
  function record(type:PlayEvent['type'],target?:string,visible?:boolean) {
    const event:PlayEvent={id:crypto.randomUUID(),clientId,clientAt:Date.now(),sequence:sequence++,type,stage,...(target?{target:target.slice(0,100)}:{}),...(visible===undefined?{}:{visible})};
    queue.push(event);if(queue.length>500){queue=queue.slice(-499);queue.push({id:crypto.randomUUID(),clientId,clientAt:Date.now(),sequence:sequence++,type:'error',stage,target:'offline_queue_overflow'});}persist();void flush();
  }
  const visibility=()=>record('visibility',undefined,!document.hidden);
  const pagehide=()=>{record('exit',undefined,false);if(queue.length)navigator.sendBeacon(`/api/play/sessions/${id}/events`,new Blob([JSON.stringify({events:queue.slice(0,50)})],{type:'application/json'}));};
  const runtimeError=()=>record('error','client_runtime_error');
  window.addEventListener('error',runtimeError);window.addEventListener('unhandledrejection',runtimeError);
  const online=()=>{void flush();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('online',online);
  const timer=setInterval(()=>{record('heartbeat',undefined,!document.hidden);},10000);
  void flush();
  return {record,flush,stage(next:PlayEvent['stage']){stage=next;record('stage',undefined,!document.hidden);},stop(){pagehide();stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('online',online);window.removeEventListener('error',runtimeError);window.removeEventListener('unhandledrejection',runtimeError);}};
}
