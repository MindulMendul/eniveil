<script lang="ts">
  import { localePath, translate } from "../../../shared/lib";
  import type { LegalLocale } from "../../../shared/lib/legal";

  let { locale }: { locale: LegalLocale } = $props();
</script>

<nav class="legal-links" aria-label={translate(locale, "legalNavigation")}>
  <a href={localePath(locale, "/terms")}>{translate(locale, "termsOfService")}</a>
  <a href={localePath(locale, "/privacy")}>{translate(locale, "privacyPolicy")}</a>
</nav>

<style>
  .legal-links { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .75rem; letter-spacing: normal; }
  a { display: inline-flex; align-items: center; min-height: 2.75rem; color: inherit; text-underline-offset: .25rem; }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>
