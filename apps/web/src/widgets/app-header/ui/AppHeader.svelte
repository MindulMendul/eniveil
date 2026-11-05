<script lang="ts">
  import type { Snapshot } from "@festival/shared";

  let { snapshot, connected }: { snapshot: Snapshot | null; connected: boolean } = $props();
</script>

<header class="header">
  <a class="brand" href="/" aria-label="이상한 축제 홈">
    <span class="emblem">✳</span>
    <span>이상한 축제<small class="brand-subtitle">THE STRANGE FESTIVAL</small></span>
  </a>
  <div class="identity">
    {#if snapshot}
      <span class:live={connected} class="dot"></span>
      <span>{snapshot.me.nickname}</span>
      <span class="tag identity-tag">GUEST</span>
    {:else}
      <span class="edition">첫 번째 밤의 초대</span>
    {/if}
  </div>
</header>
