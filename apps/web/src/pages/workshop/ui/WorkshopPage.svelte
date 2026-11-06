<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { translate } from "../../../shared/lib";

  type StoryCatalogItem = {
    id: string;
    version: number;
    mode: "solo" | "multiplayer";
    locale: string;
    title: string;
    subtitle: string;
    playerCount: { min: number; max: number };
    estimatedMinutes: number;
  };

  let { locale }: { locale: "ko" | "en" } = $props();
  const t = (key: string) => translate(locale, key as Parameters<typeof translate>[1]);

  let stories = $state<StoryCatalogItem[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let loadRequestVersion = 0;
  let pendingOffset = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const pageSize = 100;
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let mode = $state<"all" | "solo" | "multiplayer">("all");

  let filteredStories = $derived(stories);

  function isStory(value: unknown): value is StoryCatalogItem {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    const players = item.playerCount as Record<string, unknown> | undefined;
    return (
      typeof item.id === "string" &&
      typeof item.version === "number" &&
      (item.mode === "solo" || item.mode === "multiplayer") &&
      typeof item.locale === "string" &&
      typeof item.title === "string" &&
      typeof item.subtitle === "string" &&
      !!players &&
      typeof players.min === "number" &&
      typeof players.max === "number" &&
      typeof item.estimatedMinutes === "number"
    );
  }

  async function loadStories(nextOffset = 0) {
    pendingOffset = nextOffset;
    const requestVersion = ++loadRequestVersion;
    loading = true;
    error = "";
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(nextOffset),
      });
      const keyword = query.trim().slice(0, 100);
      if (keyword) params.set("q", keyword);
      if (mode !== "all") params.set("mode", mode);
      const response = await fetch(`/api/workshop/stories?${params}`);
      if (!response.ok) throw new Error(t("workshopLoadFailed"));
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { items?: unknown }).items) ||
        !(payload as { items: unknown[] }).items.every(isStory) ||
        typeof (payload as { total?: unknown }).total !== "number"
      ) {
        throw new Error(t("workshopLoadFailed"));
      }
      if (requestVersion !== loadRequestVersion) return;
      stories = (payload as { items: StoryCatalogItem[] }).items;
      total = (payload as { total: number }).total;
      offset = nextOffset;
    } catch {
      if (requestVersion === loadRequestVersion) {
        error = t("workshopLoadFailed");
      }
    } finally {
      if (requestVersion === loadRequestVersion) {
        loading = false;
      }
    }
  }

  function handleSearchInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      void loadStories(0);
    }, 250);
  }

  onMount(() => {
    void loadStories(0);
  });

  onDestroy(() => {
    clearTimeout(searchTimer);
  });
</script>

<main class="main">
  <div class="page-heading">
    <div>
      <p class="eyebrow">THE STORY WORKSHOP</p>
      <h1 class="heading-one">{t("workshopTitle")}</h1>
      <p class="muted">{t("workshopDescription")}</p>
    </div>
    <a class="text-button" href={locale === "en" ? "/en/" : "/"}>← {t("backToFestival")}</a>
  </div>

  <aside class="panel mb-6" role="note"><p class="muted m-0">{t("workshopAuthoringSoon")}</p></aside>

  <section class="panel mb-6">
    <label class="input-label" for="story-search">{t("workshopSearchPlaceholder")}</label>
    <input class="input-field" id="story-search" value={query} maxlength="100" oninput={handleSearchInput} type="search" placeholder={t("workshopSearchPlaceholder")} />
    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("workshopDescription")}>
      <button class:active={mode === "all"} class="tab" onclick={() => { clearTimeout(searchTimer); mode = "all"; void loadStories(0); }}>{t("workshopFilterAll")}</button>
      <button class:active={mode === "solo"} class="tab" onclick={() => { clearTimeout(searchTimer); mode = "solo"; void loadStories(0); }}>{t("workshopFilterSolo")}</button>
      <button class:active={mode === "multiplayer"} class="tab" onclick={() => { clearTimeout(searchTimer); mode = "multiplayer"; void loadStories(0); }}>{t("workshopFilterMultiplayer")}</button>
    </div>
  </section>

  {#if loading}
    <div class="empty" role="status"><p>{t("workshopLoading")}</p></div>
  {:else if error}
    <div class="empty" role="alert"><p>{error}</p><button class="secondary" onclick={() => void loadStories(pendingOffset)}>{t("workshopRetry")} ↻</button></div>
  {:else if !filteredStories.length}
    <div class="empty"><span class="empty-symbol">✧</span><h2 class="heading-three">{query.trim() || mode !== "all" ? t("workshopNoMatches") : t("workshopEmpty")}</h2></div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each filteredStories as story (story.id + ":" + story.version)}
        <article class="panel flex flex-col">
          <div class="section-heading">
            <span class="eyebrow section-eyebrow">{story.mode === "solo" ? t("workshopSolo") : t("workshopMultiplayer")}</span>
            <span class="tag">{story.locale.toUpperCase()}</span>
          </div>
          <h2 class="heading-two mt-4">{story.title}</h2>
          <p class="muted grow">{story.subtitle}</p>
          <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-festival-line pt-4 text-xs text-festival-muted">
            <span>{t("workshopPlayers")}: {story.playerCount.min}{story.playerCount.max !== story.playerCount.min ? "–" + story.playerCount.max : ""}</span>
            <span>{t("workshopMinutes")}: {story.estimatedMinutes} min</span>
          </div>
        </article>
      {/each}
    </div>
    {#if total > pageSize}
      <nav class="mt-6 flex items-center justify-between" aria-label={locale === "en" ? "Story pages" : "작품 페이지"}>
        <button class="secondary" disabled={offset === 0} onclick={() => void loadStories(Math.max(0, offset - pageSize))}>
          ← {locale === "en" ? "Previous" : "이전"}
        </button>
        <span class="muted text-sm">{offset + 1}–{Math.min(offset + pageSize, total)} / {total}</span>
        <button class="secondary" disabled={offset + pageSize >= total} onclick={() => void loadStories(offset + pageSize)}>
          {locale === "en" ? "Next" : "다음"} →
        </button>
      </nav>
    {/if}
  {/if}
</main>
