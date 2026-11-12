<script lang="ts">
  import { onMount,type Snippet } from 'svelte';
  import type { SoloExit } from '../../shared/lib/solo-lifecycle';
  let {exit,children}:{exit:SoloExit;children:Snippet}=$props();
  onMount(()=>{
    // Page exits only suspend the view. Explicit exit and reconnect grace own room cleanup.
    if(exit.soloPlayId)sessionStorage.setItem(`owned-solo:${exit.roomId}`,exit.soloPlayId);
  });
</script>
{@render children()}
