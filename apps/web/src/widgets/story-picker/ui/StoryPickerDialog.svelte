<script lang="ts">
  import { Button } from "../../../shared/ui";

  type CatalogStory = {
    id: string;
    version: number;
    title: string;
    subtitle: string;
    players: number;
    minutes: number;
    available: boolean;
    kind: "original" | "demo";
    origin: "original" | "demo";
    difficulty: "easy" | "normal" | "hard" | null;
    averageRating: number | null;
    ratingCount: number;
    completedPlays: number;
    uniquePlayers: number;
  };

  let {
    open,
    busy,
    connected,
    t,
    onClose,
    onWorkshop,
    onCreate,
  }: {
    open: boolean;
    busy: boolean;
    connected: boolean;
    t: (key: string) => string;
    onClose: () => void;
    onWorkshop: () => void;
    onCreate: (scenarioId: string) => void;
  } = $props();

  let stories = $state<CatalogStory[]>([]);
  let loading = $state(false);
  let error = $state("");
  let search = $state("");
  let origin = $state("all");
  let difficulty = $state("all");
  let players = $state("all");
  let sort = $state("latest");
  let page = $state(1);
  let pages = $state(0);
  let retry = $state(0);

  function openDialog(node: HTMLDialogElement, initiallyOpen: boolean) {
    if (initiallyOpen && !node.open) node.showModal();
    return {
      update(nextOpen: boolean) {
        if (nextOpen && !node.open) node.showModal();
        if (!nextOpen && node.open) node.close();
      },
    };
  }

  $effect(() => {
    if (!open) return;
    retry;

    const params = new URLSearchParams({
      page: String(page),
      limit: "6",
      sort,
    });
    if (search.trim()) params.set("search", search.trim());
    if (origin !== "all") params.set("origin", origin);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (players !== "all") params.set("players", players);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      loading = true;
      error = "";
      void fetch(`/api/stories?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("workshopLoadFailed"));
          return response.json();
        })
        .then((payload: { items?: CatalogStory[]; pages?: number }) => {
          if (!Array.isArray(payload.items) || typeof payload.pages !== "number") {
            throw new Error(t("workshopLoadFailed"));
          }
          stories = payload.items;
          pages = payload.pages;
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            error = cause instanceof Error ? cause.message : t("workshopLoadFailed");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) loading = false;
        });
    }, search.trim() ? 250 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  function resetPage() {
    page = 1;
  }
</script>

{#if open}
  <div class="modal-backdrop" role="presentation">
    <dialog class="modal max-h-[88vh] overflow-y-auto" use:openDialog={open} oncancel={onClose} aria-labelledby="picker-title">
      <div class="section-heading">
        <p class="eyebrow section-eyebrow">CHOOSE YOUR STORY</p>
        <Button variant="dismiss" ariaLabel={t("closeStoryPicker")} onclick={onClose}>×</Button>
      </div>
      <h2 class="modal-title" id="picker-title">{t("chooseStory")}</h2>
      <div class="tabs">
        <span class="tab selected">{t("platformStories")}</span>
        <Button variant="tab" class="tab" onclick={onWorkshop}>{t("workshopNav")} ↗</Button>
      </div>

      <section class="panel mb-4 mt-4">
        <label class="input-label" for="story-catalog-search">{t("workshopSearchPlaceholder")}</label>
        <input
          class="input-field"
          id="story-catalog-search"
          type="search"
          bind:value={search}
          oninput={resetPage}
          placeholder={t("workshopSearchPlaceholder")}
        />
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="input-label">
            {t("storyOrigin")}
            <select class="input-field" bind:value={origin} onchange={resetPage}>
              <option value="all">{t("workshopFilterAll")}</option>
              <option value="original">{t("storyOriginal")}</option>
              <option value="demo">{t("storyDemo")}</option>
            </select>
          </label>
          <label class="input-label">
            {t("storyDifficulty")}
            <select class="input-field" bind:value={difficulty} onchange={resetPage}>
              <option value="all">{t("workshopFilterAll")}</option>
              <option value="easy">{t("difficultyEasy")}</option>
              <option value="normal">{t("difficultyNormal")}</option>
              <option value="hard">{t("difficultyHard")}</option>
            </select>
          </label>
          <label class="input-label">
            {t("workshopPlayers")}
            <select class="input-field" bind:value={players} onchange={resetPage}>
              <option value="all">{t("allPlayerCounts")}</option>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
          </label>
          <label class="input-label">
            {t("storySort")}
            <select class="input-field" bind:value={sort} onchange={resetPage}>
              <option value="latest">{t("sortLatest")}</option>
              <option value="rating">{t("sortRating")}</option>
              <option value="popular">{t("sortPopular")}</option>
            </select>
          </label>
        </div>
      </section>

      {#if loading}
        <div class="empty" role="status"><p>{t("workshopLoading")}</p></div>
      {:else if error}
        <div class="empty" role="alert"><p>{error}</p><Button variant="secondary" onclick={() => (retry += 1)}>{t("workshopRetry")} ↻</Button></div>
      {:else if !stories.length}
        <div class="empty"><span class="empty-symbol">✧</span><h3 class="heading-three">{t("workshopNoMatches")}</h3></div>
      {:else}
        <div class="grid gap-3 md:grid-cols-2">
          {#each stories as story (story.id + ":" + story.version)}
            <article class="panel flex flex-col">
              <div class="section-heading">
                <span class="eyebrow section-eyebrow">{story.origin === "original" ? t("storyOriginal") : t("storyDemo")}</span>
                <span class="tag">{story.available ? t("storyAvailable") : t("storyComingSoon")}</span>
              </div>
              <h3 class="heading-three mt-3">{story.title}</h3>
              <p class="muted grow">{story.subtitle}</p>
              <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-festival-line pt-3 text-xs text-festival-muted">
                <div><dt>{t("workshopPlayers")}</dt><dd>{story.players}{t("playerUnit")}</dd></div>
                <div><dt>{t("storyDifficulty")}</dt><dd>{story.difficulty ? t(`difficulty${story.difficulty[0].toUpperCase()}${story.difficulty.slice(1)}`) : t("difficultyUndetermined")}</dd></div>
                <div><dt>{t("storyRating")}</dt><dd>{story.averageRating === null ? t("noRatingYet") : `${story.averageRating.toFixed(1)} / 5 (${story.ratingCount})`}</dd></div>
                <div><dt>{t("storyUniquePlayers")}</dt><dd>{story.uniquePlayers}</dd></div>
                <div><dt>{t("storyCompletedPlays")}</dt><dd>{story.completedPlays}</dd></div>
              </dl>
              <Button class="mt-4 w-full" disabled={!story.available || busy || !connected} onclick={() => onCreate(story.id)}>
                {story.available ? t("createRoom") : t("storyComingSoon")}
              </Button>
            </article>
          {/each}
        </div>
      {/if}

      <footer class="mt-4 flex items-center justify-between border-t border-festival-line pt-4">
        <Button variant="secondary" disabled={page <= 1 || loading} onclick={() => (page -= 1)}>{t("previous")} ←</Button>
        <span class="muted text-sm">{page} / {Math.max(pages, 1)}</span>
        <Button variant="secondary" disabled={page >= pages || loading} onclick={() => (page += 1)}>{t("next")} →</Button>
      </footer>
    </dialog>
  </div>
{/if}
