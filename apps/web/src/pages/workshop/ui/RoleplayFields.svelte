<script lang="ts">
  import type { StoryPackage } from '@festival/shared';
  import { Button, Select, TextInput } from '../../../shared/ui';

  let { source = $bindable(), locale, disabled }: { source: StoryPackage; locale: 'ko' | 'en'; disabled: boolean } = $props();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  const mechanics = $derived(source.content.mechanics.type === 'roleplay' ? source.content.mechanics : null);
  const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  function addRole() {
    if (!mechanics) return;
    const roleId = id('role');
    source.content.roles.push({ id: roleId, name: label('새 역할', 'New role') });
    mechanics.memories.push({ roleId, text: label('이 역할만 아는 기억을 작성하세요.', 'Write a memory known only to this role.') });
    source.story.playerCount.max = source.content.roles.length;
    source.story.playerCount.min = Math.min(source.story.playerCount.min, source.story.playerCount.max);
  }
  function removeRole(index: number) {
    if (!mechanics || source.content.roles.length <= 2) return;
    const [role] = source.content.roles.splice(index, 1);
    if (!role) return;
    mechanics.memories = mechanics.memories.filter(memory => memory.roleId !== role.id);
    source.content.items = source.content.items.filter(item => item.initialOwnerRoleId !== role.id);
    source.story.playerCount.max = source.content.roles.length;
    source.story.playerCount.min = Math.min(source.story.playerCount.min, source.story.playerCount.max);
    if (mechanics.answerRoleId === role.id) mechanics.answerRoleId = source.content.roles[0]!.id;
  }
  function addClue(stage: 'firstClues' | 'secondClues') {
    if (!mechanics) return;
    mechanics[stage].push({ id: id(stage === 'firstClues' ? 'first-clue' : 'second-clue'), text: label('새 단서', 'New clue') });
  }
  function addRoom() { mechanics?.rooms?.push({ id: id('room'), name: label('새 조사 방', 'New investigation room'), requiredClueIds: [], itemIds: [], entryCost: [], entryReward: [], entryPenalty: [] }); }
  function addResource() { mechanics?.resources?.push({ id: id('resource'), name: label('새 자원', 'New resource'), initialValue: 0, scope: 'personal' }); }
  function addItem() {
    source.content.items.push({ id: id('item'), name: label('새 아이템', 'New item'), visibleTo: { type: 'all' }, transfer: { mode: 'anyone' } });
  }
  const ids = (value: string) => value.split(',').map(entry => entry.trim()).filter(Boolean);
  const readChanges = (value: string) => value.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [resourceId, amount] = entry.split(':'); return { resourceId: resourceId!.trim(), amount: Number(amount) };
  }).filter(change => change.resourceId && Number.isInteger(change.amount) && change.amount > 0);
  const showChanges = (changes: { resourceId: string; amount: number }[]) => changes.map(change => `${change.resourceId}:${change.amount}`).join(', ');
  function addRecipe() { mechanics?.itemRecipes?.push({ id: id('recipe'), itemIds: source.content.items.slice(0, 2).map(item => item.id), resultItemId: source.content.items[0]?.id ?? '' }); }
</script>

{#if mechanics}
  <fieldset {disabled}>
    <legend>{label('역할극 진행 설정', 'Roleplay settings')}</legend>
    <p class="muted">{label('비공개 기억과 정답은 플레이어에게 직접 전달되지 않으며, 서버가 역할과 공개 시점을 판정합니다.', 'Private memories and the answer are not sent directly to players; the server decides roles and release timing.')}</p>

    <section><h3>{label('역할과 비공개 기억', 'Roles and private memories')}</h3>
      {#each source.content.roles as role, index (role.id)}
        {@const memory = mechanics.memories.find(entry => entry.roleId === role.id)}
        <div class="card"><label>{label('역할 ID', 'Role ID')}<TextInput bind:value={role.id} /></label><label>{label('역할 이름', 'Role name')}<TextInput bind:value={role.name} /></label>
          {#if memory}<label>{label('비공개 기억', 'Private memory')}<textarea class="input-field" bind:value={memory.text}></textarea></label>{:else}<p role="alert">{label('이 역할의 비공개 기억이 필요해요.', 'This role needs a private memory.')}</p>{/if}
          <Button variant="text" disabled={source.content.roles.length <= 2} onclick={() => removeRole(index)}>{label('역할 삭제', 'Delete role')}</Button>
        </div>
      {/each}
      <Button variant="secondary" onclick={addRole}>{label('역할 추가', 'Add role')}</Button>
    </section>

    <section><h3>{label('조사·회의·최종 선택', 'Investigation, meeting and final choice')}</h3>
      <div class="grid"><label>{label('1차 조사(초)', 'First investigation (sec)')}<input class="input-field" type="number" min="30" max="3600" bind:value={mechanics.stageDurations!.firstInvestigationSeconds} /></label><label>{label('회의(초)', 'Meeting (sec)')}<input class="input-field" type="number" min="30" max="3600" bind:value={mechanics.stageDurations!.meetingSeconds} /></label><label>{label('2차 조사(초)', 'Second investigation (sec)')}<input class="input-field" type="number" min="30" max="3600" bind:value={mechanics.stageDurations!.secondInvestigationSeconds} /></label></div>
      <label>{label('회의 안내문', 'Meeting prompt')}<textarea class="input-field" bind:value={mechanics.meetingPrompt}></textarea></label>
      {#each [['firstClues', label('1차 단서', 'First clues')], ['secondClues', label('2차 단서', 'Second clues')]] as [stage, heading]}
        <h4>{heading}</h4>{#each mechanics[stage as 'firstClues' | 'secondClues'] as clue, index (typeof clue === 'string' ? index : clue.id)}
          {#if typeof clue === 'string'}<label><TextInput value={clue} oninput={(event) => mechanics[stage as 'firstClues' | 'secondClues'][index] = event.currentTarget.value} /></label>
          {:else}<div class="row"><label>{label('단서 ID', 'Clue ID')}<TextInput bind:value={clue.id} /></label><label>{label('내용', 'Text')}<TextInput bind:value={clue.text} /></label></div>{/if}
          <Button variant="text" onclick={() => mechanics[stage as 'firstClues' | 'secondClues'].splice(index, 1)}>{label('단서 삭제', 'Delete clue')}</Button>
        {/each}<Button variant="secondary" onclick={() => addClue(stage as 'firstClues' | 'secondClues')}>{label('단서 추가', 'Add clue')}</Button>
      {/each}
      <label>{label('진상 공개', 'Truth reveal')}<textarea class="input-field" bind:value={mechanics.answer}></textarea></label>
      <label>{label('정답 역할', 'Answer role')}<Select bind:value={mechanics.answerRoleId}>{#each source.content.roles as role}<option value={role.id}>{role.name}</option>{/each}</Select></label>
      {#each mechanics.finalChoices ?? [] as choice, index (choice.id)}<div class="row"><label>{label('선택 ID', 'Choice ID')}<TextInput bind:value={choice.id} /></label><label>{label('선택 문구', 'Choice')}<TextInput bind:value={choice.label} /></label><label>{label('결과', 'Outcome')}<TextInput bind:value={choice.outcome} /></label><Button variant="text" onclick={() => mechanics.finalChoices?.splice(index, 1)}>{label('삭제', 'Delete')}</Button></div>{/each}
      <Button variant="secondary" onclick={() => mechanics.finalChoices?.push({ id: id('choice'), label: label('새 선택', 'New choice'), outcome: label('결과를 작성하세요.', 'Write the outcome.') })}>{label('최종 선택 추가', 'Add final choice')}</Button>
    </section>

    <section><h3>{label('방·자원·아이템', 'Rooms, resources and items')}</h3>
      {#each mechanics.rooms ?? [] as room, index (room.id)}<div class="card"><label>{label('방 ID', 'Room ID')}<TextInput bind:value={room.id} /></label><label>{label('방 이름', 'Room name')}<TextInput bind:value={room.name} /></label><label>{label('설명', 'Description')}<TextInput value={room.description ?? ''} oninput={(event) => { room.description = event.currentTarget.value || undefined; }} /></label><label>{label('필요 단서 ID (쉼표)', 'Required clue IDs (comma separated)')}<TextInput value={room.requiredClueIds.join(', ')} oninput={(event) => { room.requiredClueIds = ids(event.currentTarget.value); }} /></label><label>{label('방 아이템 ID (쉼표)', 'Room item IDs (comma separated)')}<TextInput value={room.itemIds.join(', ')} oninput={(event) => { room.itemIds = ids(event.currentTarget.value); }} /></label><label>{label('입장 비용 자원:수량 (쉼표)', 'Entry cost resource:amount (comma separated)')}<TextInput value={showChanges(room.entryCost)} oninput={(event) => { room.entryCost = readChanges(event.currentTarget.value); }} /></label><label>{label('입장 보상 자원:수량 (쉼표)', 'Entry reward resource:amount (comma separated)')}<TextInput value={showChanges(room.entryReward)} oninput={(event) => { room.entryReward = readChanges(event.currentTarget.value); }} /></label><label>{label('입장 패널티 자원:수량 (쉼표)', 'Entry penalty resource:amount (comma separated)')}<TextInput value={showChanges(room.entryPenalty)} oninput={(event) => { room.entryPenalty = readChanges(event.currentTarget.value); }} /></label><Button variant="text" onclick={() => mechanics.rooms?.splice(index, 1)}>{label('방 삭제', 'Delete room')}</Button></div>{/each}<Button variant="secondary" onclick={addRoom}>{label('방 추가', 'Add room')}</Button>
      {#each mechanics.resources ?? [] as resource, index (resource.id)}<div class="row"><label>{label('자원 ID', 'Resource ID')}<TextInput bind:value={resource.id} /></label><label>{label('이름', 'Name')}<TextInput bind:value={resource.name} /></label><label>{label('초기값', 'Initial')}<input class="input-field" type="number" min="0" max="999" bind:value={resource.initialValue} /></label><label>{label('범위', 'Scope')}<Select bind:value={resource.scope}><option value="personal">{label('개인', 'Personal')}</option><option value="shared">{label('공용', 'Shared')}</option></Select></label><Button variant="text" onclick={() => mechanics.resources?.splice(index, 1)}>{label('삭제', 'Delete')}</Button></div>{/each}<Button variant="secondary" onclick={addResource}>{label('자원 추가', 'Add resource')}</Button>
      {#each source.content.items as item, index (item.id)}<div class="card"><label>{label('아이템 ID', 'Item ID')}<TextInput bind:value={item.id} /></label><label>{label('아이템 이름', 'Item name')}<TextInput bind:value={item.name} /></label><label>{label('초기 소유 역할', 'Initial owner')}<Select value={item.initialOwnerRoleId ?? ''} onchange={(event) => { item.initialOwnerRoleId = event.currentTarget.value || undefined; }}><option value="">{label('없음', 'None')}</option>{#each source.content.roles as role}<option value={role.id}>{role.name}</option>{/each}</Select></label><label>{label('전달 규칙', 'Transfer rule')}<Select value={item.transfer.mode} onchange={(event) => { const mode = event.currentTarget.value; item.transfer = mode === 'owner_choice' ? { mode, toRoleIds: [] } : mode === 'anyone' ? { mode } : { mode: 'never' }; }}><option value="never">{label('전달 불가', 'Never')}</option><option value="owner_choice">{label('소유자가 선택', 'Owner chooses')}</option><option value="anyone">{label('누구나 전달', 'Anyone')}</option></Select></label>{#if item.transfer.mode === 'owner_choice'}<label>{label('전달 가능 역할 ID (쉼표)', 'Recipient role IDs (comma separated)')}<TextInput value={item.transfer.toRoleIds.join(', ')} oninput={(event) => { if (item.transfer.mode === 'owner_choice') item.transfer.toRoleIds = ids(event.currentTarget.value); }} /></label>{/if}<label class="check"><input type="checkbox" checked={!!item.use} onchange={(event) => { item.use = event.currentTarget.checked ? { label: label('사용하기', 'Use'), result: label('아이템을 사용했습니다.', 'Item used.'), consumes: true } : undefined; }} /> {label('사용 가능', 'Can be used')}</label>{#if item.use}<label>{label('사용 버튼 문구', 'Use label')}<TextInput bind:value={item.use.label} /></label><label>{label('사용 결과', 'Use result')}<TextInput bind:value={item.use.result} /></label><label class="check"><input type="checkbox" bind:checked={item.use.consumes} /> {label('사용 후 소모', 'Consume after use')}</label>{/if}<Button variant="text" onclick={() => source.content.items.splice(index, 1)}>{label('아이템 삭제', 'Delete item')}</Button></div>{/each}<Button variant="secondary" onclick={addItem}>{label('아이템 추가', 'Add item')}</Button>
      <h4>{label('아이템 조합', 'Item recipes')}</h4>{#each mechanics.itemRecipes ?? [] as recipe, index (recipe.id)}<div class="row"><label>{label('레시피 ID', 'Recipe ID')}<TextInput bind:value={recipe.id} /></label><label>{label('재료 아이템 ID (쉼표, 2개 이상)', 'Ingredient item IDs (comma, 2+)')}<TextInput value={recipe.itemIds.join(', ')} oninput={(event) => { recipe.itemIds = ids(event.currentTarget.value); }} /></label><label>{label('결과 아이템 ID', 'Result item ID')}<TextInput bind:value={recipe.resultItemId} /></label><Button variant="text" onclick={() => mechanics.itemRecipes?.splice(index, 1)}>{label('삭제', 'Delete')}</Button></div>{/each}<Button variant="secondary" disabled={source.content.items.length < 2} onclick={addRecipe}>{label('조합 추가', 'Add recipe')}</Button>
    </section>
  </fieldset>
{/if}

<style>
fieldset, section { border:0; padding:0; min-width:0; display:grid; gap:var(--spacing-4) }
section { border-top:var(--border-thin) solid var(--color-workshop-line); padding-top:var(--spacing-4) }
label { display:flex; flex-direction:column; gap:var(--spacing-2) }.check { flex-direction:row; align-items:center }.card,.row,.grid { display:grid; gap:var(--spacing-3); padding:var(--spacing-3); border:var(--border-thin) solid var(--color-workshop-border) }.row,.grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr)) }.input-field { width:100%; box-sizing:border-box } textarea { min-height:5rem; resize:vertical }.muted { color:var(--color-text-muted) }
</style>
