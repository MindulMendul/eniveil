<script lang="ts">
  import type { Snapshot } from "@festival/shared";
  import type { LegalLocale } from "../../../shared/lib/legal";
  import LegalLinks from "./LegalLinks.svelte";

  let {
    snapshot,
    connected,
    t,
    locale,
  }: { snapshot: Snapshot | null; connected: boolean; t: (key: string) => string; locale: LegalLocale } = $props();
</script>

<footer class="footer">
  <span>{t("brandSubtitle")}</span>
  <span class="footer-tagline">{t("footerTagline")}</span>
  <LegalLinks {locale} />
  {#if snapshot}
    <span class:offline={!connected}>{connected ? t("connected") : t("disconnected")}</span>
  {:else}
    <span>{t("homeTitle")}</span>
  {/if}
</footer>

<style>
  .footer { flex-wrap: wrap; align-items: center; }
</style>
