<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { workshopRequest, type WorkshopStory } from '../model/_story';
  let { locale, loggedIn = false, onLogin, onEdit }: {
    locale: 'ko' | 'en'; loggedIn?: boolean; onLogin: () => void; onEdit: (id?: string) => void;
  } = $props();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  let stories = $state<WorkshopStory[]>([]), total = $state(0), offset = $state(0);
  let loading = $state(true), error = $state(''), query = $state(''), author = $state('');
  let view = $state('all'), sort = $state('latest'), mode = $state(''), difficulty = $state('');
  let ratingMin = $state(''), playsMin = $state(''), favoritesMin = $state(''), publishedAfter = $state('');
  let selected = $state<WorkshopStory | null>(null), dialog: HTMLDialogElement;
  let favoriteBusy = $state<string[]>([]);
  let request = 0, pendingOffset = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const pageSize = 24;
  const tabs = [
    { key: 'all', ko: '최신 순', en: 'Latest', sort: 'latest' },
    { key: 'favorites', ko: '즐겨찾기', en: 'Favorites', sort: 'latest' },
    { key: 'rating', ko: '최고 평점', en: 'Top rated', sort: 'rating' },
    { key: 'plays', ko: '플레이 횟수', en: 'Most played', sort: 'plays' },
    { key: 'mine', ko: '내가 만든 목록', en: 'My stories', sort: 'latest' },
  ];
  let tab = $state('all');
  async function load(nextOffset = 0) {
    pendingOffset = nextOffset;
    const version = ++request;
    loading = true; error = '';
    try {
      const params = new URLSearchParams({ view, sort, limit: String(pageSize), offset: String(nextOffset) });
      for (const [key, value] of Object.entries({ q: query.trim(), author: author.trim(), mode, difficulty, ratingMin, playsMin, favoritesMin, publishedAfter })) {
        if (value) params.set(key, value);
      }
      const data = await workshopRequest(`/stories?${params}`);
      if (version !== request) return;
      stories = data.items; total = data.total; offset = nextOffset;
    } catch (cause) {
      if (version === request) error = cause instanceof Error ? cause.message : label('목록을 불러오지 못했어요.', 'Could not load stories.');
    } finally { if (version === request) loading = false; }
  }
  function schedule() {
    clearTimeout(timer); request++; loading = true; error = '';
    timer = setTimeout(() => void load(0), 250);
  }
  function refresh() { clearTimeout(timer); request++; loading = true; queueMicrotask(() => void load(0)); }
  function chooseTab(next: typeof tabs[number]) {
    if ((next.key === 'favorites' || next.key === 'mine') && !loggedIn) { onLogin(); return; }
    tab = next.key; view = next.key === 'favorites' || next.key === 'mine' ? next.key : 'all'; sort = next.sort; refresh();
  }
  function edit(id?: string) { onEdit(id); }
  async function favorite(story: WorkshopStory) {
    if (!loggedIn) { onLogin(); return; }
    if (favoriteBusy.includes(story.id)) return;
    favoriteBusy = [...favoriteBusy, story.id];
    error = '';
    try {
      const { item } = await workshopRequest(`/stories/${encodeURIComponent(story.id)}/favorite`, { method: story.isFavorite ? 'DELETE' : 'PUT' });
      if (selected?.id === item.id) selected = item;
      await load(offset);
    } catch (cause) { error = cause instanceof Error ? cause.message : label('즐겨찾기를 저장하지 못했어요.', 'Could not save favorite.'); }
    finally { favoriteBusy = favoriteBusy.filter(id => id !== story.id); }
  }
  async function details(story: WorkshopStory) { selected = story; await tick(); dialog.showModal(); }
  function reset() {
    query = ''; author = ''; mode = ''; difficulty = ''; ratingMin = ''; playsMin = ''; favoritesMin = ''; publishedAfter = ''; refresh();
  }
  const difficultyLabel = (value: WorkshopStory['difficulty']) => value === 'easy' ? label('쉬움', 'Easy') : value === 'normal' ? label('보통', 'Normal') : value === 'hard' ? label('어려움', 'Hard') : label('미지정', 'Unspecified');
  onMount(() => { void load(); });
  onDestroy(() => { clearTimeout(timer); request++; });
</script>

<main class="main workshop">
  <div class="page-heading">
    <div><p class="eyebrow">COMMUNITY STORIES</p><h1 class="heading-one">{label('창작마당', 'Workshop')}</h1><p class="muted">{label('누군가의 상상에서 시작된 이야기. 다음 이야기는 당신이 만들어 보세요.', 'Discover stories from the community. Create the next one yourself.')}</p></div>
    <button class="primary" onclick={() => edit()}>＋ {label('새 머미 만들기', 'Create a story')}</button>
  </div>
  <a class="text-button" href={locale === 'en' ? '/en/' : '/'}>← {label('플랫폼으로 돌아가기', 'Back to platform')}</a>
  <nav class="tabs" aria-label={label('창작 머미 목록', 'Story collections')}>
    {#each tabs as item}<button class="tab" class:active={tab === item.key} aria-pressed={tab === item.key} onclick={() => chooseTab(item)}>{label(item.ko, item.en)}</button>{/each}
  </nav>
  <section class="panel filters" aria-label={label('작품 필터', 'Story filters')}>
    <label>{label('제목·설명', 'Title / description')}<input class="input-field" type="search" maxlength="100" bind:value={query} oninput={schedule} placeholder={label('어떤 이야기를 찾으세요?', 'Find your next story')} /></label>
    <label>{label('만든 이', 'Creator')}<input class="input-field" type="search" maxlength="100" bind:value={author} oninput={schedule} placeholder={label('제작자 이름', 'Creator name')} /></label>
    <label>{label('평점', 'Rating')}<select class="input-field" bind:value={ratingMin} onchange={refresh}><option value="">{label('전체 평점', 'Any rating')}</option>{#each [1,2,3,4,5] as rating}<option value={String(rating)}>{rating} ★ {label('이상', 'and up')}</option>{/each}</select></label>
    <label>{label('플레이 횟수', 'Play count')}<input class="input-field" type="number" min="0" max="1000000000" step="1" bind:value={playsMin} oninput={schedule} placeholder={label('최소 횟수', 'Minimum plays')} /></label>
    <label>{label('즐겨찾기 수', 'Favorite count')}<input class="input-field" type="number" min="0" max="1000000000" step="1" bind:value={favoritesMin} oninput={schedule} placeholder={label('최소 수', 'Minimum favorites')} /></label>
    <label>{label('난이도', 'Difficulty')}<select class="input-field" bind:value={difficulty} onchange={refresh}><option value="">{label('모든 난이도', 'Any difficulty')}</option><option value="easy">{label('쉬움', 'Easy')}</option><option value="normal">{label('보통', 'Normal')}</option><option value="hard">{label('어려움', 'Hard')}</option><option value="unset">{label('미지정', 'Unspecified')}</option></select></label>
    <label>{label('모드', 'Mode')}<select class="input-field" bind:value={mode} onchange={refresh}><option value="">{label('모든 모드', 'Any mode')}</option><option value="solo">{label('혼자 플레이', 'Solo')}</option><option value="multiplayer">{label('함께 플레이', 'Multiplayer')}</option></select></label>
    <label>{label('공개일 이후', 'Published since')}<input class="input-field" type="date" bind:value={publishedAfter} onchange={refresh} /></label>
    <label>{label('정렬', 'Sort by')}<select class="input-field" bind:value={sort} onchange={refresh}><option value="latest">{label('최신 순', 'Newest')}</option><option value="rating">{label('최고 평점', 'Top rated')}</option><option value="plays">{label('플레이 횟수', 'Most played')}</option><option value="favorites">{label('즐겨찾기 수', 'Most favorited')}</option><option value="title">{label('제목 순', 'Title')}</option></select></label>
    <button class="secondary reset" onclick={reset}>{label('필터 초기화', 'Reset filters')}</button>
  </section>
  <div class="results"><span class="muted" aria-live="polite">{label('작품', 'Stories')} {total}</span>{#if !loggedIn}<span class="muted">{label('로그인하면 창작과 즐겨찾기를 이용할 수 있어요.', 'Sign in to create stories and save favorites.')}</span>{/if}</div>
  {#if error}<div class="panel notice" role="alert"><p>{error}</p><button class="secondary" onclick={() => void load(pendingOffset)}>{label('다시 시도', 'Retry')}</button></div>{/if}
  {#if loading}<div class="empty" role="status">{label('이야기를 불러오는 중…', 'Loading stories…')}</div>
  {:else if !stories.length}<div class="empty"><span class="empty-symbol">✧</span><h2 class="heading-three">{label('아직 일치하는 이야기가 없어요.', 'No stories match yet.')}</h2><p class="muted">{label('필터를 바꾸거나 새로운 이야기를 만들어 보세요.', 'Try different filters or create a story.')}</p></div>
  {:else}
    <div class="story-grid">{#each stories as story (story.id)}
      <article class="panel story-card">
        <div class="thumbnail">{#if story.thumbnailUrl}<img src={story.thumbnailUrl} alt={story.title} loading="lazy" referrerpolicy="no-referrer" />{:else}<span aria-hidden="true">✧</span><span class="thumbnail-caption">STORY ARCHIVE</span>{/if}<span class="mode-tag">{story.mode === 'solo' ? label('혼자 플레이', 'Solo') : label('함께 플레이', 'Multiplayer')}</span></div>
        <div class="card-content"><div class="card-heading"><span class="tag">{difficultyLabel(story.difficulty)}</span>{#if !story.published}<span class="tag">{label('비공개 초안', 'Private draft')}</span>{/if}</div>
        <h2 class="heading-two">{story.title}</h2><p class="muted description">{story.subtitle}</p><p class="creator">{label('만든 이', 'By')} · {story.author.name}</p>
        <div class="statistics"><span>★ {story.averageRating === null ? label('평가 전', 'Unrated') : story.averageRating.toFixed(1)} <small>({story.ratingCount})</small></span><span>▷ {story.playCount} {label('플레이', 'plays')}</span><span>♡ {story.favoriteCount}</span></div>
        <div class="card-actions"><button class="secondary" onclick={() => details(story)}>{label('자세히 보기', 'Details')}</button>{#if story.published}<button class="favorite" class:saved={story.isFavorite} aria-pressed={story.isFavorite} aria-label={`${story.title} ${label('즐겨찾기', 'favorite')}`} disabled={favoriteBusy.includes(story.id)} onclick={() => void favorite(story)}>{story.isFavorite ? '♥' : '♡'}</button>{/if}{#if story.canEdit}<button class="text-button" onclick={() => edit(story.id)}>{label('수정하기', 'Edit')} ↗</button>{/if}</div>
        </div>
      </article>
    {/each}</div>
    {#if total > pageSize}<nav class="pagination" aria-label={label('작품 페이지', 'Story pages')}><button class="secondary" disabled={loading || offset === 0} onclick={() => void load(Math.max(0, offset-pageSize))}>← {label('이전', 'Previous')}</button><span class="muted">{offset+1}–{Math.min(offset+pageSize,total)} / {total}</span><button class="secondary" disabled={loading || offset+pageSize >= total} onclick={() => void load(offset+pageSize)}>{label('다음', 'Next')} →</button></nav>{/if}
  {/if}
</main>
<dialog bind:this={dialog} class="story-dialog" aria-labelledby="story-dialog-title" onclose={() => selected = null}>
  {#if selected}<div class="dialog-content"><p class="eyebrow">STORY DETAILS</p><h2 id="story-dialog-title" class="heading-two">{selected.title}</h2><p class="muted">{selected.subtitle}</p><p>{label('만든 이', 'Creator')}: {selected.author.name}</p><p>{label('난이도', 'Difficulty')}: {difficultyLabel(selected.difficulty)}</p><p>★ {selected.averageRating?.toFixed(1) ?? label('평가 전', 'Unrated')} · {selected.playCount} {label('플레이', 'plays')} · ♡ {selected.favoriteCount}</p><p class="muted">{selected.playerCount.min}–{selected.playerCount.max} {label('명', 'players')} · {selected.estimatedMinutes} {label('분', 'min')}</p><div class="card-actions"><button class="primary" onclick={() => dialog.close()}>{label('닫기', 'Close')}</button>{#if selected.canEdit}<button class="secondary" onclick={() => { const id = selected!.id; dialog.close(); edit(id); }}>{label('수정하기', 'Edit')}</button>{/if}</div></div>{/if}
</dialog>
<style>
  .workshop{padding-bottom:4rem}.workshop .primary,.workshop .secondary,.story-dialog .primary,.story-dialog .secondary{width:auto;margin-top:0}.tabs{display:flex;flex-wrap:wrap;gap:.5rem;margin:2rem 0 1rem}.tabs .tab{padding:.7rem 1rem;border:1px solid #39443b;color:#b2b8ad;background:transparent;cursor:pointer}.tabs .tab.active{border-color:#c7ad70;color:#e1c985;background:#30382a}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem}.filters label{display:flex;flex-direction:column;gap:.5rem;font-size:.8rem}.reset{align-self:end}.results{display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin:1.5rem 0;font-size:.8rem}.story-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:1.5rem}.story-card{padding:0;overflow:hidden;display:flex;flex-direction:column}.thumbnail{position:relative;height:180px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(ellipse at top,#35443a,#171c1a);color:#c7ad70;font-size:3rem;border-bottom:1px solid #39443b}.thumbnail img{width:100%;height:100%;object-fit:cover}.thumbnail-caption{font-size:.6rem;letter-spacing:.25em}.mode-tag{position:absolute;bottom:.75rem;left:1rem;background:#171c1ae8;padding:.35rem .65rem;font-size:.65rem}.card-content{display:flex;flex:1;flex-direction:column;padding:1.25rem}.card-heading{display:flex;gap:.5rem;margin-bottom:1rem}.description{flex:1;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.creator{font-size:.75rem;color:#b2b8ad;margin:1rem 0}.statistics{display:flex;flex-wrap:wrap;gap:1rem;font-size:.75rem;color:#c7ad70;border-top:1px solid #39443b;padding:1rem 0}.statistics small{color:#b2b8ad}.card-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.65rem}.favorite{padding:.5rem .8rem;border:1px solid #59634f;background:transparent;color:#c7ad70;font-size:1.2rem}.favorite.saved{background:#3d4833}.pagination{display:flex;justify-content:space-between;align-items:center;margin-top:2rem;gap:1rem}.story-dialog{width:min(540px,calc(100% - 2rem));padding:0;background:#202820;color:#eee9dd;border:1px solid #59634f}.story-dialog::backdrop{background:#000b}.dialog-content{padding:2rem;overflow-wrap:anywhere}.notice{margin:1rem 0}button:disabled{opacity:.5;cursor:wait}
</style>
