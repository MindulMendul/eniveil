<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Button, TextInput } from '../../shared/ui';
  type Presence = 'offline' | 'lobby' | 'room_waiting' | 'playing';
  type Person = { id: string; nickname: string; online?: boolean; presence?: Presence };
  let { locale, accountId, poll = false, onAuthLost = () => {} }: { locale: 'ko' | 'en'; accountId: string; poll?: boolean; onAuthLost?: () => void } = $props();
  const inputId = $props.id();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  const presenceLabel = (presence?: Presence) => {
    const labels = {
      offline: label('오프라인', 'Offline'),
      lobby: label('로비 대기 중', 'Waiting in lobby'),
      room_waiting: label('방 대기 중', 'Waiting in room'),
      playing: label('플레이 중', 'Playing'),
    };
    return presence ? labels[presence] : undefined;
  };
  let nickname = $state(''), error = $state(''), message = $state('');
  let listError = $state('');
  let loading = $state(true), busy = $state(false), searched = $state(false);
  let friends = $state<Person[]>([]), incoming = $state<Person[]>([]), outgoing = $state<Person[]>([]), matches = $state<Person[]>([]);
  const controller = new AbortController();
  let generation = 0;
  onDestroy(() => controller.abort());
  async function api(path = '', body?: object) {
    const response = await fetch('/api/friends' + path, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { 'X-Account-ID': accountId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      friends = []; incoming = []; outgoing = []; matches = [];
      onAuthLost();
    }
    if (!response.ok) throw Error(label(data.error || '요청에 실패했어요.', 'Request failed. Check the account and try again.'));
    return data;
  }
  async function load(silent = false) {
    const current = ++generation;
    if (!silent) loading = true;
    try {
      const data = await api();
      if (controller.signal.aborted || current !== generation) return;
      friends = data.friends; incoming = data.incoming; outgoing = data.outgoing;
      listError = '';
    } catch (cause) {
      if (!controller.signal.aborted && current === generation) {
        friends = []; incoming = []; outgoing = [];
        listError = cause instanceof Error ? cause.message : label('목록을 갱신하지 못했어요.', 'Could not refresh the list.');
      }
    } finally { if (!controller.signal.aborted && current === generation) loading = false; }
  }
  async function action(run: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await run(); }
    catch (cause) { if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : label('연결을 확인해 주세요.', 'Check your connection.'); }
    finally { if (!controller.signal.aborted) busy = false; }
  }
  onMount(() => {
    void action(load);
    if (!poll) return;
    let polling = false;
    const timer = setInterval(() => {
      if (!busy && !polling) { polling = true; void load(true).finally(() => { polling = false; }); }
    }, 15000);
    return () => clearInterval(timer);
  });
  async function search() {
    await action(async () => {
      matches = []; searched = false;
      const result = await api('/search?nickname=' + encodeURIComponent(nickname.trim()));
      matches = result.items; searched = true;
    });
  }
  async function request(person: Person) {
    await action(async () => {
      await api('/requests', { accountId: person.id });
      matches = []; searched = false;
      await load(); message = label('친구 요청을 보냈어요.', 'Friend request sent.');
    });
  }
  async function respond(person: Person, accept: boolean) {
    await action(async () => {
      await api(`/requests/${person.id}/${accept ? 'accept' : 'reject'}`, {});
      await load(); message = label('요청을 처리했어요.', 'Request updated.');
    });
  }
  async function cancel(person: Person) {
    await action(async () => {
      await api(`/requests/${person.id}/cancel`, {});
      await load(); message = label('친구 요청을 취소했어요.', 'Friend request cancelled.');
    });
  }
  async function remove(person: Person) {
    await action(async () => {
      await api(`/friends/${person.id}/remove`, {});
      await load(); message = label('친구를 삭제했어요.', 'Friend removed.');
    });
  }
</script>

<div class="friends-panel">
  <form onsubmit={event => { event.preventDefault(); void search(); }}>
    <label for={inputId}>{label('친구 닉네임', 'Friend nickname')}</label>
    <div class="friend-search"><TextInput id={inputId} bind:value={nickname} oninput={() => { matches = []; searched = false; }} required maxlength={20} autocomplete="off" disabled={busy} /><Button type="submit" disabled={busy || !nickname.trim()}>{label('검색', 'Search')}</Button></div>
  </form>
  {#if error || listError}<p role="alert">{error || listError}</p><Button variant="secondary" disabled={busy} onclick={() => void action(load)}>{label('목록 다시 불러오기', 'Reload list')}</Button>{/if}
  <p role="status">{message}</p>
  {#if searched}
    {#if !matches.length}<p role="status">{label('사용자를 찾을 수 없어요.', 'No matching accounts.')}</p>{/if}
    <ul>{#each matches as person (person.id)}<li><span>{person.nickname} · {person.id.slice(0,8)}</span><Button disabled={busy} onclick={() => void request(person)}>{label('친구 요청', 'Send request')}</Button></li>{/each}</ul>
  {/if}
  {#if loading}<p role="status">{label('불러오는 중…', 'Loading…')}</p>{:else}
    <h3>{label('받은 요청', 'Incoming requests')} ({incoming.length})</h3>
    <ul>{#each incoming as person (person.id)}<li><span>{person.nickname}</span><div><Button disabled={busy} onclick={() => void respond(person,true)} aria-label={`${person.nickname} ${label('수락', 'Accept')}`}>{label('수락', 'Accept')}</Button><Button variant="secondary" disabled={busy} onclick={() => void respond(person,false)} aria-label={`${person.nickname} ${label('거절', 'Reject')}`}>{label('거절', 'Reject')}</Button></div></li>{/each}</ul>
    <h3>{label('보낸 요청', 'Sent requests')} ({outgoing.length})</h3>
    <ul>{#each outgoing as person (person.id)}<li><span>{person.nickname}</span><Button variant="secondary" disabled={busy} onclick={() => void cancel(person)}>{label('요청 취소', 'Cancel request')}</Button></li>{/each}</ul>
    {#if poll}
      <h3>{label('온라인', 'Online')} ({friends.filter(person => person.online).length})</h3>
      <ul>{#each friends.filter(person => person.online) as person (person.id)}<li><span>{person.nickname}{#if presenceLabel(person.presence)} · {presenceLabel(person.presence)}{/if}</span><Button variant="secondary" disabled={busy} onclick={() => void remove(person)}>{label('친구 삭제', 'Remove friend')}</Button></li>{/each}</ul>
      <h3>{label('오프라인', 'Offline')} ({friends.filter(person => !person.online).length})</h3>
      <ul>{#each friends.filter(person => !person.online) as person (person.id)}<li><span>{person.nickname}{#if presenceLabel(person.presence)} · {presenceLabel(person.presence)}{/if}</span><Button variant="secondary" disabled={busy} onclick={() => void remove(person)}>{label('친구 삭제', 'Remove friend')}</Button></li>{/each}</ul>
    {:else}
      <h3>{label('친구', 'Friends')} ({friends.length})</h3>
      <ul>{#each friends as person (person.id)}<li><span>{person.nickname}{#if presenceLabel(person.presence)} · {presenceLabel(person.presence)}{/if}</span><Button variant="secondary" disabled={busy} onclick={() => void remove(person)}>{label('친구 삭제', 'Remove friend')}</Button></li>{/each}</ul>
    {/if}
    {#if !friends.length && !error && !listError}<p>{label('친구가 없어요.', 'No friends yet.')}</p>{/if}
    <Button variant="secondary" disabled={busy} onclick={() => void action(load)}>{label('새로고침', 'Refresh')}</Button>
  {/if}
</div>

<style>
  .friend-search, li { display:flex; align-items:center; flex-wrap:wrap; gap:var(--spacing-3); }
  .friend-search { margin-top:var(--spacing-2); }
  .friend-search :global(input) { flex:1; min-width:0; }
  li { justify-content:space-between; padding-block:var(--spacing-2); overflow-wrap:anywhere; }
  ul { list-style:none; padding:0; }
  h3 { margin-top:var(--spacing-6); }
</style>
