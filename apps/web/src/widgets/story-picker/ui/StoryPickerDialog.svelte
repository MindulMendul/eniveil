<script lang="ts">
  import { Select, TextInput, Button, Modal, StateMessage, Card, Badge } from "../../../shared/ui";

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
    startedPlays: number;
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
  let filtersOpen = $state(false);
  let activeFilterCount = $derived(
    [search.trim() !== "", origin !== "all", difficulty !== "all", players !== "all", sort !== "latest"]
      .filter(Boolean).length,
  );
  const pageSize = 6;

  $effect(() => {
    if (!open) filtersOpen = false;
  });

  $effect(() => {
    if (!open) return;
    retry;

    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
      sort,
    });
    if (search.trim()) params.set("q", search.trim());
    if (origin !== "all") params.set("origin", origin);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (players !== "all") params.set("players", players);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      loading = true;
      error = "";
      void fetch(`/api/lobby/stories?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("workshopLoadFailed"));
          return response.json();
        })
        .then((payload: { items?: CatalogStory[]; total?: number; limit?: number }) => {
          if (
            !Array.isArray(payload.items) ||
            typeof payload.total !== "number" ||
            typeof payload.limit !== "number"
          ) {
            throw new Error(t("workshopLoadFailed"));
          }
          stories = payload.items;
          pages = Math.ceil(payload.total / payload.limit);
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
  <Modal {open} {onClose} labelledby="picker-title" class="story-picker-modal">
      <div class="section-heading">
        <p class="eyebrow section-eyebrow">CHOOSE YOUR STORY</p>
        <Button variant="dismiss" ariaLabel={t("closeStoryPicker")} onclick={onClose}>×</Button>
      </div>
      <h2 class="modal-title" id="picker-title">{t("chooseStory")}</h2>
      <div class="tabs">
        <span class="tab selected">{t("platformStories")}</span>
        <Button variant="tab" class="tab" onclick={onWorkshop}>{t("workshopNav")} ↗</Button>
      </div>

      <section class="story-picker-filters mb-4 mt-4">
        <Button
          variant="secondary"
          class="story-picker-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="story-picker-filter-fields"
          onclick={() => (filtersOpen = !filtersOpen)}
        >
          <span class="flex min-w-0 items-center gap-2">
            <span>{t(filtersOpen ? "hideStoryFilters" : "showStoryFilters")}</span>
            {#if activeFilterCount > 0}
              <Badge tone="gold" aria-label={`${t("activeStoryFilters")}: ${activeFilterCount}`}>{activeFilterCount}</Badge>
            {/if}
          </span>
          <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
        </Button>
        <div id="story-picker-filter-fields" class="story-picker-filter-fields" hidden={!filtersOpen}>
          <label class="input-label" for="story-catalog-search">{t("workshopSearchPlaceholder")}</label>
          <TextInput
            id="story-catalog-search"
            type="search"
            maxlength={100}
            bind:value={search}
            oninput={resetPage}
            placeholder={t("workshopSearchPlaceholder")}
           />
          <div class="story-picker-filter-grid">
            <label class="input-label">
              {t("storyOrigin")}
              <Select bind:value={origin} onchange={resetPage}>
                <option value="all">{t("workshopFilterAll")}</option>
                <option value="original">{t("storyOriginal")}</option>
                <option value="demo">{t("storyDemo")}</option>
              </Select>
            </label>
            <label class="input-label">
              {t("storyDifficulty")}
              <Select bind:value={difficulty} onchange={resetPage}>
                <option value="all">{t("workshopFilterAll")}</option>
                <option value="easy">{t("difficultyEasy")}</option>
                <option value="normal">{t("difficultyNormal")}</option>
                <option value="hard">{t("difficultyHard")}</option>
                <option value="unset">{t("difficultyUndetermined")}</option>
              </Select>
            </label>
            <label class="input-label">
              {t("workshopPlayers")}
              <Select bind:value={players} onchange={resetPage}>
                <option value="all">{t("allPlayerCounts")}</option>
                {#each Array.from({ length: 20 }, (_, index) => index + 1) as playerCount}
                  <option value={playerCount}>{playerCount}{t("playerUnit")}</option>
                {/each}
              </Select>
            </label>
            <label class="input-label">
              {t("storySort")}
              <Select bind:value={sort} onchange={resetPage}>
                <option value="latest">{t("sortLatest")}</option>
                <option value="rating">{t("sortRating")}</option>
                <option value="popular">{t("sortPopular")}</option>
              </Select>
            </label>
          </div>
        </div>
      </section>

      {#if loading}
        <StateMessage kind="loading" message={t("workshopLoading")} />
      {:else if error}
        <div class="empty" role="alert"><p>{error}</p><Button variant="secondary" onclick={() => (retry += 1)}>{t("workshopRetry")} ↻</Button></div>
      {:else if !stories.length}
        <div class="empty"><span class="empty-symbol">✧</span><h3 class="heading-three">{t("workshopNoMatches")}</h3></div>
      {:else}
        <div class="story-picker-grid">
          {#each stories as story (story.id + ":" + story.version)}
            <Card class="flex flex-col">
              <div class="section-heading">
                <span class="eyebrow section-eyebrow">{story.origin === "original" ? t("storyOriginal") : t("storyDemo")}</span>
                <Badge>{story.available ? t("storyAvailable") : t("storyComingSoon")}</Badge>
              </div>
              <h3 class="heading-three mt-3">{story.title}</h3>
              <p class="muted grow">{story.subtitle}</p>
              <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-festival-line pt-3 text-xs text-festival-muted">
                <div><dt>{t("workshopPlayers")}</dt><dd>{story.players}{t("playerUnit")}</dd></div>
                <div><dt>{t("storyDifficulty")}</dt><dd>{story.difficulty ? t(`difficulty${story.difficulty[0].toUpperCase()}${story.difficulty.slice(1)}`) : t("difficultyUndetermined")}</dd></div>
                <div><dt>{t("storyRating")}</dt><dd>{story.averageRating === null ? t("noRatingYet") : `${story.averageRating.toFixed(1)} / 5 (${story.ratingCount})`}</dd></div>
                <div><dt>{t("storyUniquePlayers")}</dt><dd>{story.uniquePlayers}</dd></div>
                <div><dt>{t("storyStartedPlays")}</dt><dd>{story.startedPlays}</dd></div>
                <div><dt>{t("storyCompletedPlays")}</dt><dd>{story.completedPlays}</dd></div>
              </dl>
              <Button class="mt-4 w-full" disabled={!story.available || busy || !connected} onclick={() => onCreate(story.id)}>
                {story.available ? t("createRoom") : t("storyComingSoon")}
              </Button>
            </Card>
          {/each}
        </div>
      {/if}

      <footer class="mt-4 flex items-center justify-between gap-3 border-t border-festival-line pt-4">
        <Button variant="secondary" disabled={page <= 1 || loading} onclick={() => (page -= 1)}>{t("previous")} ←</Button>
        <span class="muted whitespace-nowrap text-sm">{page} / {Math.max(pages, 1)}</span>
        <Button variant="secondary" disabled={page >= pages || loading} onclick={() => (page += 1)}>{t("next")} →</Button>
      </footer>
  </Modal>
{/if}

<style>
  :global(.story-picker-modal) {
    width: min(var(--layout-content), calc(100% - var(--spacing-6)));
    max-width: var(--layout-content);
  }

  :global(.story-picker-filter-toggle) {
    margin-top: 0;
  }

  .story-picker-filter-fields {
    padding: var(--spacing-4);
    border: var(--border-thin) solid var(--color-festival-line);
    border-top: 0;
  }

  .story-picker-filter-fields .input-label {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .story-picker-filter-fields > .input-label {
    margin-bottom: var(--spacing-2);
  }

  .story-picker-filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--layout-filter-min)), 1fr));
    gap: var(--spacing-3);
    margin-top: var(--spacing-3);
  }

  .story-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--layout-card-min)), 1fr));
    gap: var(--spacing-3);
  }
</style>
