<script lang="ts">
  import { Button, Select } from "../../../shared/ui";
  import { storyPackageSchema, type StoryPackage } from '@festival/shared';
  import { createStoryDraft, editorErrors, serializeDraft } from '../model/_editor';
  import StoryFields from './StoryFields.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { workshopRequest, type WorkshopStory } from '../model/_story';
  let { locale, storyId, onBack, onSaved, onDirtyChange }: { locale: 'ko' | 'en'; storyId?: string; onBack: () => void; onSaved: (id: string) => void; onDirtyChange: (dirty: boolean) => void } = $props();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  let source = $state<StoryPackage | null>(null), error = $state(''), message = $state('');
  let loading = $state(false), saving = $state(false), validating = $state(false);
  let difficulty = $state(''), thumbnailUrl = $state(''), published = $state(false);
  let fileRequest = 0, disposed = false, fileInput: HTMLInputElement;
  onDestroy(() => { disposed = true; fileRequest++; onDirtyChange(false); });
  let pendingSceneIds = $state(false);
  let baseline = $state('');
  const snapshot = () => JSON.stringify({ source, difficulty, thumbnailUrl, published });
  const dirty = $derived(!!source && (snapshot() !== baseline || pendingSceneIds));
  $effect(() => { onDirtyChange(dirty); });
  const issues = $derived(source ? editorErrors(source, locale) : []);
  function back() { if (!dirty || window.confirm(label('저장하지 않은 변경을 버리고 나갈까요?', 'Discard unsaved changes?'))) onBack(); }
  function exportFile() {
    if (!source || issues.length || pendingSceneIds) return;
    try {
      const url = URL.createObjectURL(new Blob([serializeDraft(source)], {type: 'application/json'}));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${source.story.id}.mstory`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { error = label('파일은 900 KB 이하여야 해요.', 'The file must be 900 KB or smaller.'); }
  }
  function apply(item: WorkshopStory, storyPackage: StoryPackage) {
    source = storyPackage; difficulty = item.difficulty ?? ''; thumbnailUrl = item.thumbnailUrl ?? ''; published = item.published; baseline = snapshot();
  }
  onMount(() => {
    if (!storyId) { source = createStoryDraft(locale); baseline = snapshot(); return; }
    loading = true;
    void workshopRequest(`/drafts/${encodeURIComponent(storyId)}`).then(({item, package: storyPackage}) => { if (!disposed) apply(item, storyPackage); }).catch(cause => { if (!disposed) error = cause.message; }).finally(() => { if (!disposed) loading = false; });
  });
  onMount(() => {
    const guard = (event: PopStateEvent) => {
      if (dirty && !window.confirm(label('저장하지 않은 변경을 버리고 나갈까요?', 'Discard unsaved changes?'))) {
        event.stopImmediatePropagation();
        history.pushState({}, '', `${locale === 'en' ? '/en' : ''}/workshop/editor${storyId ? `?id=${encodeURIComponent(storyId)}` : ''}`);
      }
    };
    window.addEventListener('popstate', guard, true);
    return () => window.removeEventListener('popstate', guard, true);
  });
  async function importFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (dirty && !window.confirm(label('현재 변경을 버리고 파일을 불러올까요?', 'Discard current changes and import this file?'))) { fileInput.value = ''; return; }
    const version = ++fileRequest;
    error = ''; message = ''; validating = true;
    try {
      if (!file.name.toLowerCase().endsWith('.mstory')) throw new Error(label('.mstory 파일을 선택해 주세요.', 'Choose a .mstory file.'));
      // Keep enough room for metadata in the server's 1 MiB request limit.
      if (file.size > 900 * 1024) throw new Error(label('파일은 900 KB 이하여야 해요.', 'The file must be 900 KB or smaller.'));
      const candidate = JSON.parse(await file.text());
      const result = await workshopRequest('/stories/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidate) });
      if (disposed || version !== fileRequest) return;
      if (!result.valid) throw new Error(label('스토리 형식을 확인해 주세요.', 'Check the story format.'));
      storyPackageSchema.parse(candidate); source = candidate;
      message = label('스토리 파일을 불러왔어요. 저장하면 내 창작 목록에 추가돼요.', 'Story imported. Save it to add it to your stories.');
    } catch (cause) { if (!disposed && version === fileRequest) error = (cause as {status?: number})?.status === 422 ? label('스토리 형식을 확인해 주세요. 유효한 .mstory 패키지가 필요해요.', 'Invalid story format. Choose a valid .mstory package.') : cause instanceof Error ? cause.message : label('파일을 읽을 수 없어요.', 'Could not read this file.'); }
    finally { if (!disposed && version === fileRequest) { validating = false; fileInput.value = ''; } }
  }
  async function save() {
    if (!source || loading || saving || validating || issues.length || pendingSceneIds) return;
    saving = true; error = ''; message = '';
    try {
      serializeDraft(source);
      const { item } = await workshopRequest(storyId ? `/drafts/${encodeURIComponent(storyId)}` : '/drafts', {
        method: storyId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: source, difficulty: difficulty || null, thumbnailUrl: thumbnailUrl.trim() || null, published }),
      });
      if (disposed) return;
      baseline = snapshot();
      message = label('저장했어요.', 'Saved.'); onSaved(item.id);
    } catch (cause) { if (!disposed) error = cause instanceof Error ? cause.message : label('저장하지 못했어요.', 'Could not save.'); }
    finally { if (!disposed) saving = false; }
  }
</script>
<svelte:window onbeforeunload={(event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }} />
<main id="main-content" tabindex="-1" class="main editor">
  <Button class="text-button" onclick={back} variant="text">← {label('창작마당으로 돌아가기', 'Back to workshop')}</Button>
  <div class="page-heading"><div><p class="eyebrow">STORY SANDBOX</p><h1 class="heading-one">{storyId ? label('머미 수정하기', 'Edit story') : label('새 머미 만들기', 'Create a story')}</h1></div></div>
  <section class="panel"><h2 class="heading-two">{label('샌드박스', 'Sandbox')}</h2>
    {#if loading}<p role="status">{label('기존 스토리를 불러오는 중…', 'Loading your story…')}</p>{/if}
    {#if error}<p role="alert" class="notice">{error}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
    <label class="file-label">{label('.mstory 파일 불러오기', 'Import .mstory file')}<input bind:this={fileInput} type="file" accept=".mstory,application/json" disabled={loading || saving || validating} onchange={importFile} /><small class="muted">{label('최대 900 KB · 유효한 스토리 패키지', 'Up to 900 KB · Valid story package')}</small></label>
    {#if validating}<p role="status">{label('파일을 확인하는 중…', 'Validating file…')}</p>{/if}
    {#if source}<div class="source-summary"><h3 class="heading-three">{source.story.title}</h3></div>
      <StoryFields bind:pendingChanges={pendingSceneIds} bind:source {locale} disabled={saving || validating || loading} />
      {#if issues.length}<div role="alert" class="notice"><p>{label('다음 필드를 확인해 주세요.', 'Check these fields before saving:')}</p><ul>{#each issues as issue}<li>{issue}</li>{/each}</ul></div>{/if}
      <Button variant="secondary" disabled={saving || validating || loading || issues.length > 0 || pendingSceneIds} onclick={exportFile}>{label('.mstory 내보내기', 'Export .mstory')}</Button>
      <div class="metadata"><label>{label('난이도', 'Difficulty')}<Select bind:value={difficulty} disabled={saving || validating || loading}><option value="">{label('미지정', 'Unspecified')}</option><option value="easy">{label('쉬움', 'Easy')}</option><option value="normal">{label('보통', 'Normal')}</option><option value="hard">{label('어려움', 'Hard')}</option></Select></label></div>
      <label class="visibility"><input type="checkbox" disabled={saving || validating || loading} bind:checked={published} /> {label('창작마당에 공개하기', 'Publish in the workshop')}</label><p class="muted">{label('공개하지 않으면 내가 만든 목록에서만 볼 수 있어요. 원본 파일은 만든 이만 열 수 있어요.', 'Private drafts appear only in your stories. Only the creator can access the source file.')}</p>
      <Button class="primary" disabled={saving || validating || loading || issues.length > 0 || pendingSceneIds} onclick={() => void save()} variant="primary">{saving ? label('저장 중…', 'Saving…') : label('스토리 저장', 'Save story')}</Button>
    {/if}
  </section>
</main>
<style>
.editor {
  padding-bottom:var(--spacing-16)}
.editor :global(.primary) {
  width:auto}
.page-heading {
  margin-top:var(--spacing-8)}
.file-label {
  display:flex;
  flex-direction:column;
  gap:var(--spacing-4);
  border:var(--border-thin) dashed var(--color-workshop-border);
  padding:var(--spacing-6);
  margin:var(--spacing-6) 0}
.metadata {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--layout-size-200-px)),1fr));
  gap:var(--spacing-4);
  margin:var(--spacing-6) 0}
.metadata label {
  display:flex;
  flex-direction:column;
  gap:var(--spacing-2)}
.visibility {
  display:flex;
  align-items:center;
  gap:var(--spacing-2)}
.notice {
  color:var(--color-workshop-warning); overflow-wrap:anywhere}
.source-summary {
  border-bottom:var(--border-thin) solid var(--color-workshop-line);
  padding-bottom:var(--spacing-4)}
</style>
