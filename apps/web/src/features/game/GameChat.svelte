<script lang="ts">
  import { onMount } from 'svelte';
  import { Button,TextInput } from '../../shared/ui';
  let {sessionId,members}:{sessionId:string;members:{id:string;nickname:string}[]}=$props();
  let messages=$state<{sequence:number;userId:string;text:string;at:number}[]>([]),text=$state(''),error=$state(''),busy=$state(false);
  const controller=new AbortController();
  async function refresh(){try{const r=await fetch(`/api/play/sessions/${sessionId}/chat`,{signal:controller.signal});if(r.ok)messages=(await r.json()).messages;}catch{/* Next poll retries transient disconnects. */}}
  async function send(){if(busy||!text.trim())return;busy=true;error='';try{const r=await fetch(`/api/play/sessions/${sessionId}/chat`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),text})});const data=await r.json();if(!r.ok)throw Error(data.error);text='';await refresh();}catch(cause){if(!controller.signal.aborted)error=cause instanceof Error?cause.message:'전송하지 못했어.';}finally{busy=false;}}
  onMount(()=>{void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>{clearInterval(timer);controller.abort();};});
</script>
<section class="panel mt-5" aria-label="게임 채팅">
  <h2 class="heading-two">채팅</h2>
  <ol class="m-0 max-h-72 list-none overflow-auto p-0" aria-live="polite">{#each messages as message(message.sequence)}<li class="py-2"><strong>{members.find(m=>m.id===message.userId)?.nickname??'참가자'}</strong> <span class="whitespace-pre-wrap break-words">{message.text}</span></li>{/each}</ol>
  <form class="mt-3 flex gap-2" onsubmit={event=>{event.preventDefault();void send();}}><TextInput aria-label="채팅 메시지" maxlength={1000} bind:value={text}/><Button type="submit" disabled={busy||!text.trim()}>전송</Button></form>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
