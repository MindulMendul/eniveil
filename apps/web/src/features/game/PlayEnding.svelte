<script lang="ts">
  import { onMount } from 'svelte';
  import type { StoryCue } from '@festival/shared';
  import StoryCuePlayer from './StoryCuePlayer.svelte';
  import StoryRating from './StoryRating.svelte';
  import { Button } from '../../shared/ui';
  import { playTracker } from '../../shared/lib/play-tracker';
  let { id,onExit,locale='ko' }: {id:string;onExit:()=>void;locale?:'ko'|'en'}=$props();
  let view=$state<{storyId:string;outcome:string;mode:string;endingComplete:boolean;finished:boolean;cueIndex:number;result:{cues?:StoryCue[];message?:string;answer?:string;votes?:{voter:string;target:string}[]}}|null>(null);
  let error=$state(''),busy=$state(false);
  let tracker:ReturnType<typeof playTracker>|undefined;
  async function ending() {
    if(busy)return;busy=true;error='';
    try{if(tracker&&!await tracker.flush())throw Error(locale==='en'?'Could not save play records. Please retry.':'플레이 기록을 저장하지 못했어. 다시 시도해 줘.');const response=await fetch(`/api/play/sessions/${id}/ending`,{method:'POST'});const data=await response.json();if(!response.ok)throw Error(data.error);if(view)view.endingComplete=true;tracker?.stage('rating');}
    catch(cause){error=cause instanceof Error?cause.message:'연결을 확인해 줘.';}finally{busy=false;}
  }
  onMount(()=>{
    let disposed=false;
    void fetch(`/api/play/sessions/${id}`).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(disposed)return;if(data.finished||data.outcome==='abandoned'){sessionStorage.removeItem(`active-play:${data.storyId}`);sessionStorage.removeItem(`solo-ui:${id}`);onExit();return;}if(!data.ended)throw Error('아직 끝나지 않은 플레이야.');view=data;tracker=playTracker(id);tracker.stage(data.endingComplete?'rating':data.mode==='solo'?(data.outcome==='failed'?'fail':'win'):'reveal');}).catch(cause=>{if(!disposed)error=cause.message;});
    return()=>{disposed=true;tracker?.stop();};
  });
</script>
<section class="mx-auto max-w-[760px] border border-festival-line bg-festival-panel p-6 text-center">
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !view}<p role="status">{locale==='en'?'Loading…':'불러오는 중…'}</p>
  {:else if view.endingComplete}
    <h1 class="heading-one">{locale==='en'?'Rate this story':'스토리 평가'}</h1>
    <StoryRating runId={id} {locale} beforeSubmit={async()=>{if(tracker&&!await tracker.flush())throw Error(locale==='en'?'Could not save play records. Please retry.':'플레이 기록을 저장하지 못했어. 다시 시도해 줘.');}} onDone={()=>{if(view)sessionStorage.removeItem(`active-play:${view.storyId}`);sessionStorage.removeItem(`solo-ui:${id}`);onExit();}} />
  {:else if view.result.cues?.length}
    <StoryCuePlayer cues={view.result.cues} initialIndex={view.cueIndex} onAction={(type,index)=>tracker?.record(type==='next'?'cue_next':'cue_skip',String(index))} onComplete={ending} />
    {#if error}<Button disabled={busy} onclick={ending}>{locale==='en'?'Continue':'계속'}</Button>{/if}
  {:else}
    <h1 class="heading-one">{locale==='en'?'The ending':'결말'}</h1>
    <p class="narrative">{view.result.message??view.result.answer}</p>
    {#each view.result.votes??[] as vote}<p>{vote.voter} → {vote.target}</p>{/each}
    <Button disabled={busy} onclick={ending}>{locale==='en'?'Continue':'계속'} →</Button>
  {/if}
</section>
