<script lang="ts">
  import type { Snapshot } from "@festival/shared";

  let { snapshot, connected }: { snapshot: Snapshot | null; connected: boolean } = $props();
</script>

<footer class="footer">
  <span>THE STRANGE FESTIVAL</span>
  <span class="footer-tagline">서로 다른 비밀, 하나의 진실.</span>
  {#if snapshot}
    <span class:offline={!connected}>{connected ? "실시간 연결됨" : "재연결 중…"}</span>
  {:else}
    <span>MURDER MYSTERY CLUB</span>
  {/if}
</footer>
