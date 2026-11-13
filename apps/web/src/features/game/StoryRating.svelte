<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '../../shared/ui';
  let {runId,storyId,onDone=()=>{},beforeSubmit=async()=>{},locale='ko'}:{runId:string;storyId?:string;onDone?:()=>void;beforeSubmit?:()=>Promise<void>;locale?:'ko'|'en'}=$props();
  let busy=$state(false),error=$state('');
  let review=$state(''), spoiler=$state(false);
  type Review = {id:number;text:string|null;spoiler:number};
  let reviews=$state<Review[]>([]);
  let reported=$state<number[]>([]);
  const copy=(ko:string,en:string)=>locale==='en'?en:ko;
  async function reveal(item:Review){
    try { const response=await fetch(`/api/play/stories/${storyId}/reviews/${item.id}`); const data=await response.json(); if(!response.ok)throw Error(data.error); reviews=reviews.map(review=>review.id===item.id?{...review,text:data.text}:review); }
    catch(cause){error=cause instanceof Error?cause.message:copy('후기를 불러오지 못했어.','Could not load the review.');}
  }
  async function report(item:Review){
    try { const response=await fetch(`/api/play/stories/${storyId}/reviews/${item.id}/report`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'other'})}); const data=await response.json(); if(!response.ok)throw Error(data.error); reported=[...reported,item.id]; }
    catch(cause){error=cause instanceof Error?cause.message:copy('후기를 신고하지 못했어.','Could not report the review.');}
  }
  onMount(()=>{if(storyId)void fetch(`/api/play/stories/${storyId}/reviews`).then(response=>response.json()).then(data=>reviews=data.items??[]).catch(()=>{});});
  async function submit(rating:number|null){
    if(busy)return;busy=true;error='';
    try{await beforeSubmit();const response=await fetch(`/api/play/sessions/${runId}/rating`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating})});const data=await response.json();if(!response.ok)throw Error(data.error);if(review.trim()){const reviewed=await fetch(`/api/play/sessions/${runId}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:review,spoiler})});const result=await reviewed.json();if(!reviewed.ok)throw Error(result.error);}onDone();}
    catch(cause){error=cause instanceof Error?cause.message:'평점을 저장하지 못했어.';}finally{busy=false;}
  }
</script>
<section aria-label={locale==='en'?'Story rating':'스토리 평점'}>
  <label class="block text-left">{locale==='en'?'Review (optional)':'후기 (선택)'}<textarea class="mt-2 w-full" maxlength="1000" bind:value={review} placeholder={locale==='en'?'Share your experience':'플레이 후기를 남겨 주세요.'}></textarea></label>
  {#if review.trim()}<label class="mt-2 flex items-center justify-center gap-2 text-sm"><input type="checkbox" bind:checked={spoiler}> {copy('결말·정답 스포일러 포함','Contains ending or solution spoilers')}</label>{/if}
  <div class="flex justify-center gap-2" role="group" aria-label={locale==='en'?'Rate from 1 to 5':'1점부터 5점까지 평가'}>
    {#each [1,2,3,4,5] as value}<button class="cursor-pointer border-0 bg-transparent p-2 text-2xl text-festival-gold" aria-label={locale==='en'?`${value} stars`:`${value}점`} disabled={busy} onclick={()=>submit(value)}>☆</button>{/each}
  </div>
  <Button variant="secondary" disabled={busy} onclick={()=>submit(null)}>{locale==='en'?'Skip and return to lobby':'건너뛰고 로비로'}</Button>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if reviews.length}<section class="mt-6 text-left" aria-label={locale==='en'?'Recent reviews':'최근 후기'}><h2 class="heading-three">{locale==='en'?'Recent reviews':'최근 후기'}</h2>{#each reviews as item}<article class="muted">{#if item.spoiler && item.text === null}<p>{copy('스포일러가 포함된 후기입니다.','This review contains spoilers.')}</p><Button variant="secondary" onclick={()=>void reveal(item)}>{copy('스포일러 보기','Show spoiler')}</Button>{:else}<p>{item.text}</p>{/if}<Button variant="text" disabled={reported.includes(item.id)} onclick={()=>void report(item)}>{reported.includes(item.id)?copy('신고됨','Reported'):copy('후기 신고','Report review')}</Button></article>{/each}</section>{/if}
</section>
