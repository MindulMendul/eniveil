<script lang="ts">
  import type { StoryPackage } from '@festival/shared';
  import { Button, TextInput, Select } from '../../../shared/ui';
  let { source = $bindable(), locale, disabled }: { source: StoryPackage; locale: 'ko' | 'en'; disabled: boolean } = $props();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  function addScene() {
    source.content.scenes.push({ id: `scene-${crypto.randomUUID()}`, cues: [], choices: [] });
  }
</script>
<fieldset {disabled}>
  <legend>{label('스토리 편집', 'Story editor')}</legend>
  <label>{label('제목', 'Title')}<TextInput maxlength={5000} bind:value={source.story.title} /></label>
  <label>{label('설명', 'Description')}<textarea class="input-field" maxlength={5000} bind:value={source.story.subtitle}></textarea></label>
  <label>{label('시작 장면', 'Start scene')}<Select bind:value={source.story.startSceneId}>{#each source.content.scenes as scene}<option value={scene.id}>{scene.id}</option>{/each}</Select></label>
  <p class="muted">{label('장면 ID를 바꾸거나 삭제하면 연결된 장면과 선택지의 참조도 수정해 주세요. 편집하지 않은 패키지 정보는 유지됩니다.', 'After changing or deleting an ID, update its references. Package fields outside this editor are preserved.')}</p>
  {#each source.content.scenes as scene, sceneIndex}
    <section class="scene" aria-label={`${label('장면', 'Scene')} ${sceneIndex + 1}`}>
      <h3>{label('장면', 'Scene')} {sceneIndex + 1}</h3>
      <label>{label('장면 ID', 'Scene ID')}<TextInput bind:value={scene.id} /></label>
      <label>{label('다음 장면 ID (선택)', 'Next scene ID (optional)')}<TextInput value={scene.nextSceneId ?? ''} oninput={(event) => { const value = event.currentTarget.value; if (value) scene.nextSceneId = value; else delete scene.nextSceneId; }} /></label>
      {#each scene.cues as cue, cueIndex}
        <div class="cue">
          {#if cue.type === 'dialogue.show'}
            <label>{label('화자', 'Speaker')}<TextInput maxlength={80} value={cue.speaker ?? ''} oninput={(event) => { cue.speaker = event.currentTarget.value; }} /></label>
            <label>{label('대사', 'Dialogue')}<textarea class="input-field" maxlength={5000} bind:value={cue.text}></textarea></label>
            <Button variant="text" onclick={() => scene.cues.splice(cueIndex, 1)}>{label('대사 삭제', 'Delete dialogue')} {cueIndex + 1}</Button>
          {:else}<p>{label('유지되는 연출', 'Preserved cue')}: {cue.type} ({cue.durationMs} ms)</p>{/if}
        </div>
      {/each}
      <div class="actions"><Button variant="secondary" onclick={() => scene.cues.push({ type: 'dialogue.show', text: label('새 대사', 'New dialogue') })}>{label('대사 추가', 'Add dialogue')}</Button>
      <Button variant="text" onclick={() => source.content.scenes.splice(sceneIndex, 1)}>{label('장면 삭제', 'Delete scene')}</Button></div>
      {#if scene.choices.length}<p class="muted">{label('선택지 유지', 'Preserved choices')}: {scene.choices.map(choice => `${choice.label} → ${choice.targetSceneId}`).join(', ')}</p>{/if}
    </section>
  {/each}
  <Button variant="secondary" onclick={addScene}>{label('장면 추가', 'Add scene')}</Button>
</fieldset>
<style>
fieldset { border:0; padding:0; min-width:0; display:grid; gap:var(--spacing-4) }
legend { font-weight:bold; margin-bottom:var(--spacing-4) }
label { display:flex; flex-direction:column; gap:var(--spacing-2); min-width:0 }
textarea { min-height:var(--spacing-16); resize:vertical; width:100%; box-sizing:border-box }
.scene { border:var(--border-thin) solid var(--color-workshop-border); padding:var(--spacing-4); display:grid; gap:var(--spacing-4); min-width:0; overflow-wrap:anywhere }
.cue { display:grid; gap:var(--spacing-2) }
.actions { display:flex; flex-wrap:wrap; gap:var(--spacing-2) }
</style>
