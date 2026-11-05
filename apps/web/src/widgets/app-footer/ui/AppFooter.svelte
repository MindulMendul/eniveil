<script lang="ts">
  import type { Snapshot } from "@festival/shared";

  let {
    snapshot,
    connected,
    t,
  }: { snapshot: Snapshot | null; connected: boolean; t: (key: string) => string } = $props();
</script>

<footer class="footer">
  <span>{t("brandSubtitle")}</span>
  <span class="footer-tagline">{t("footerTagline")}</span>
  {#if snapshot}
    <span class:offline={!connected}>{connected ? t("connected") : t("disconnected")}</span>
  {:else}
    <span>{t("homeTitle")}</span>
  {/if}
</footer>
