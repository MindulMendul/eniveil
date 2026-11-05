<script lang="ts">
  import type { Snapshot } from "@festival/shared";
  import { localePath } from "../../../shared/lib";

  let {
    snapshot,
    connected,
    locale,
    t,
    onLocaleChange,
  }: {
    snapshot: Snapshot | null;
    connected: boolean;
    locale: "ko" | "en";
    t: (key: string) => string;
    onLocaleChange: (locale: "ko" | "en") => void;
  } = $props();
</script>

<header class="header">
  <a class="brand" href={localePath(locale)} aria-label={`${t("brand")} home`}>
    <span class="emblem">✳</span>
    <span>{t("brand")}<small class="brand-subtitle">{t("brandSubtitle")}</small></span>
  </a>
  <div class="flex items-center gap-4">
    <a class="text-button" href={localePath(locale, "/workshop")}>{t("workshopNav")}</a>
    <label class="sr-only" for="language">{t("language")}</label>
    <select
      class="border border-festival-line bg-festival-panel-input px-2 py-2 text-xs text-festival-text focus-visible:outline-2 focus-visible:outline-festival-gold"
      id="language"
      value={locale}
      onchange={(event) => onLocaleChange(event.currentTarget.value as "ko" | "en")}
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
    </select>
    <div class="identity">
      {#if snapshot}
        <span class:live={connected} class="dot"></span>
        <span>{snapshot.me.nickname}</span>
        <span class="tag identity-tag">GUEST</span>
      {:else}
        <span class="edition">첫 번째 밤의 초대</span>
      {/if}
    </div>
  </div>
</header>
