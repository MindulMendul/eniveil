<script lang="ts">
  import { onMount } from "svelte";
  import { translate } from "../../../shared/lib";

  type StoryCatalogItem = {
    id: string;
    version: number;
    origin: "original" | "demo";
    title: string;
    subtitle: string;
    players: number;
    minutes: number;
    available: boolean;
    difficulty: "easy" | "normal" | "hard" | null;
    averageRating: number | null;
    ratingCount: number;
    completedPlays: number;
    uniquePlayers: number;
  };

  let { locale }: { locale: "ko" | "en" } = $props();
  const t = (key: string) => translate(locale, key as Parameters<typeof translate>[1]);

  let stories = $state<StoryCatalogItem[]>([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let origin = $state<"all" | "original" | "demo">("all");

  let filteredStories = $derived(
    stories.filter((story) => {
      const keyword = query.trim().toLocaleLowerCase(locale);
      const matchesQuery =
        !keyword ||
        story.title.toLocaleLowerCase(locale).includes(keyword) ||
        story.subtitle.toLocaleLowerCase(locale).includes(keyword);
      return matchesQuery && (origin === "all" || story.origin === origin);
    }),
  );

  function isStory(value: unknown): value is StoryCatalogItem {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      typeof item.version === "number" &&
      (item.origin === "original" || item.origin === "demo") &&
      typeof item.title === "string" &&
      typeof item.subtitle === "string" &&
      typeof item.players === "number" &&
      typeof item.minutes === "number" &&
      typeof item.available === "boolean" &&
      (item.difficulty === null || ["easy", "normal", "hard"].includes(String(item.difficulty))) &&
      (item.averageRating === null || typeof item.averageRating === "number") &&
      typeof item.ratingCount === "number" &&
      typeof item.completedPlays === "number" &&
      typeof item.uniquePlayers === "number"
    );
  }

  async function loadStories() {
    loading = true;
    error = "";
    try {
      const response = await fetch("/api/stories?limit=50");
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
    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("storyOrigin")}>
      <button class:active={origin === "all"} class="tab" onclick={() => (origin = "all")}>{t("workshopFilterAll")}</button>
      <button class:active={origin === "original"} class="tab" onclick={() => (origin = "original")}>{t("storyOriginal")}</button>
      <button class:active={origin === "demo"} class="tab" onclick={() => (origin = "demo")}>{t("storyDemo")}</button>
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
            <span class="eyebrow section-eyebrow">{story.origin === "original" ? t("storyOriginal") : t("storyDemo")}</span>
            <span class="tag">{story.available ? t("storyAvailable") : t("storyComingSoon")}</span>
          </div>
          <h2 class="heading-two mt-4">{story.title}</h2>
          <p class="muted grow">{story.subtitle}</p>
          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-festival-line pt-4 text-xs text-festival-muted">
            <div><dt>{t("workshopPlayers")}</dt><dd>{story.players}{t("playerUnit")}</dd></div>
            <div><dt>{t("storyDifficulty")}</dt><dd>{story.difficulty ? t(`difficulty${story.difficulty[0].toUpperCase()}${story.difficulty.slice(1)}`) : t("difficultyUndetermined")}</dd></div>
            <div><dt>{t("storyRating")}</dt><dd>{story.averageRating === null ? t("noRatingYet") : `${story.averageRating.toFixed(1)} / 5 (${story.ratingCount})`}</dd></div>
            <div><dt>{t("storyUniquePlayers")}</dt><dd>{story.uniquePlayers}</dd></div>
            <div><dt>{t("storyCompletedPlays")}</dt><dd>{story.completedPlays}</dd></div>
            <div><dt>{t("workshopMinutes")}</dt><dd>{story.minutes} min</dd></div>
          </dl>
        </article>
      {/each}
    </div>
  {/if}
</main>
