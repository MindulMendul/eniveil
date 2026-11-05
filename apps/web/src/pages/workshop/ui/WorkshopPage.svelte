<script lang="ts">
  import { onMount } from "svelte";
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
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let mode = $state<"all" | "solo" | "multiplayer">("all");

  let filteredStories = $derived(
    stories.filter((story) => {
      const keyword = query.trim().toLocaleLowerCase(locale);
      const matchesQuery =
        !keyword ||
        story.title.toLocaleLowerCase(locale).includes(keyword) ||
        story.subtitle.toLocaleLowerCase(locale).includes(keyword);
      return matchesQuery && (mode === "all" || story.mode === mode);
    }),
  );

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

  async function loadStories() {
    loading = true;
    error = "";
    try {
      const response = await fetch("/api/workshop/stories?limit=100&offset=0");
      if (!response.ok) throw new Error(t("workshopLoadFailed"));
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { items?: unknown }).items) ||
        !(payload as { items: unknown[] }).items.every(isStory)
      ) {
        throw new Error(t("workshopLoadFailed"));
      }
      stories = (payload as { items: StoryCatalogItem[] }).items;
    } catch {
      error = t("workshopLoadFailed");
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadStories();
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
    <input class="input-field" id="story-search" bind:value={query} type="search" placeholder={t("workshopSearchPlaceholder")} />
    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("workshopDescription")}>
      <button class:active={mode === "all"} class="tab" onclick={() => (mode = "all")}>{t("workshopFilterAll")}</button>
      <button class:active={mode === "solo"} class="tab" onclick={() => (mode = "solo")}>{t("workshopFilterSolo")}</button>
      <button class:active={mode === "multiplayer"} class="tab" onclick={() => (mode = "multiplayer")}>{t("workshopFilterMultiplayer")}</button>
    </div>
  </section>

  {#if loading}
    <div class="empty" role="status"><p>{t("workshopLoading")}</p></div>
  {:else if error}
    <div class="empty" role="alert"><p>{error}</p><button class="secondary" onclick={() => void loadStories()}>{t("workshopRetry")} ↻</button></div>
  {:else if !filteredStories.length}
    <div class="empty"><span class="empty-symbol">✧</span><h2 class="heading-three">{stories.length ? t("workshopNoMatches") : t("workshopEmpty")}</h2></div>
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
  {/if}
</main>
