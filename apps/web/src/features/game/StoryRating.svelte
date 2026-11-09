<script lang="ts">
  import { Button } from '../../shared/ui';
  let {runId,onDone=()=>{},beforeSubmit=async()=>{},locale='ko'}:{runId:string;onDone?:()=>void;beforeSubmit?:()=>Promise<void>;locale?:'ko'|'en'}=$props();
  let busy=$state(false),error=$state('');
  async function submit(rating:number|null){
    if(busy)return;busy=true;error='';
    try{await beforeSubmit();const response=await fetch(`/api/play/sessions/${runId}/rating`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating})});const data=await response.json();if(!response.ok)throw Error(data.error);onDone();}
    catch(cause){error=cause instanceof Error?cause.message:'평점을 저장하지 못했어.';}finally{busy=false;}
  }
</script>
<section aria-label={locale==='en'?'Story rating':'스토리 평점'}>
  <div class="flex justify-center gap-2" role="group" aria-label={locale==='en'?'Rate from 1 to 5':'1점부터 5점까지 평가'}>
    {#each [1,2,3,4,5] as value}<button class="cursor-pointer border-0 bg-transparent p-2 text-2xl text-festival-gold" aria-label={locale==='en'?`${value} stars`:`${value}점`} disabled={busy} onclick={()=>submit(value)}>☆</button>{/each}
  </div>
  <Button variant="secondary" disabled={busy} onclick={()=>submit(null)}>{locale==='en'?'Skip and return to lobby':'건너뛰고 로비로'}</Button>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
