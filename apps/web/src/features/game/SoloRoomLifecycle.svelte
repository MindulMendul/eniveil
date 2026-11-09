<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { rememberSoloExit, type SoloExit } from '../../shared/lib/solo-lifecycle';
  let { exit, onExit, children }: {
    exit: SoloExit;
    onExit: (exit: SoloExit) => void;
    children: Snippet;
  } = $props();

  onMount(() => {
    const ownedExit = { ...exit };
    let exited = false;
    const leave = () => {
      if (exited) return;
      exited = true;
      rememberSoloExit(sessionStorage, ownedExit);
      onExit(ownedExit);
      navigator.sendBeacon('/api/lobby/rooms/solo-exit', new Blob([JSON.stringify(ownedExit)], { type: 'application/json' }));
    };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      leave();
    };
  });
</script>

{@render children()}
