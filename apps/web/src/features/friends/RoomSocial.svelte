<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snapshot, RoomSummary } from '@festival/shared';
  import { Modal, Button } from '../../shared/ui';
  let { snapshot, onEntered }: { snapshot: Snapshot; onEntered: () => Promise<void> } = $props();
  type Friend = { id: string; nickname: string; online: boolean; available: boolean; gamesTogether: number };
  type Invitation = { id: string; host: string; room: RoomSummary };
  let friends = $state<Friend[]>([]), invitations = $state<Invitation[]>([]), notices = $state<{ id: string; text: string }[]>([]);
  let selected = $state<string | null>(null), pin = $state(''), error = $state(''), message = $state(''), busy = $state(false);
  let friend = $derived(friends.find(f => f.id === selected));
  let host = $derived(snapshot.room?.hostId === snapshot.me.id && !snapshot.room?.session && !snapshot.room?.soloStarted);
  let invite = $derived(!snapshot.room ? invitations[0] : undefined);
  let pinFor = $state<string | null>(null);
  const controller = new AbortController();
  let refreshing = false;
  let dirty = false;
  async function request(path: string, body?: unknown) {
    const response = await fetch('/api/lobby' + path, { signal: controller.signal, method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? '요청에 실패했어.');
    return result;
  }
  async function refresh() {
    if (refreshing) { dirty = true; return; }
    refreshing = true;
    try { const data = await request('/social'); friends = data.friends; invitations = data.invitations; notices = data.notices; }
    catch (cause) { if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : '연결을 확인해 줘.'; }
    finally {
      refreshing = false;
      if (dirty && !controller.signal.aborted) { dirty = false; void refresh(); }
    }
  }
  async function act(path: string, body: unknown, entered = false) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await request(path, body); if (path === '/invitations') selected = null; if (entered) await onEntered(); else message = path === '/invitations' ? '초대를 보냈어.' : ''; await refresh(); }
    catch (cause) { if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : '연결을 확인해 줘.'; }
    finally { busy = false; }
  }
  onMount(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('room-social-changed', update);
    const timer = setInterval(update, 10000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('room-social-changed', update); };
  });
</script>

{#if host}
  <aside class="room-friends" aria-label="초대할 친구">
    <h2 class="heading-two">친구 초대</h2>
    {#each friends as item (item.id)}
      <Button variant="secondary" onclick={() => { selected = item.id; message = ''; error = ''; }}>{item.nickname} · {item.available ? '로비 대기 중' : item.online ? '다른 방 참여 중' : '오프라인'}</Button>
    {:else}<p class="muted">친구 목록이 비어 있어. 로비의 친구 메뉴에서 친구를 추가해 줘.</p>{/each}
  </aside>
{/if}
{#if friend && host}
  <Modal open labelledby="friend-profile-title" onClose={() => selected = null}>
    <h2 id="friend-profile-title">{friend.nickname}</h2>
    <p>나와 함께한 게임 {friend.gamesTogether}판</p>
    <p>{friend.available ? '로비 대기 중' : friend.online ? '다른 방 참여 중' : '오프라인'}</p>
    <Button disabled={busy || !friend.available || !!snapshot.room && snapshot.room.count >= snapshot.room.capacity} onclick={() => void act('/invitations', { targetId: friend?.id })}>초대</Button>
    <Button variant="secondary" onclick={() => selected = null}>닫기</Button>
    {#if message}<p role="status">{message}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </Modal>
{/if}
{#if invite}
  <aside class="invite-toast" aria-label="방 초대" aria-live="polite">
    <p>{invite.host}님이 {invite.room.title} 방에 초대했습니다. 입장하시겠습니까?</p>
    {#if pinFor === invite.id && invite.room.access === 'secret'}
      <label>4자리 PIN <input aria-label="초대받은 방 PIN" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" bind:value={pin} /></label>
    {/if}
    <div class="flex gap-3">
      <Button disabled={busy} onclick={() => {
        if (invite?.room.access === 'secret' && pinFor !== invite.id) { pinFor = invite.id; pin = ''; error = ''; return; }
        if (invite) void act(`/invitations/${invite.id}/respond`, { accept: true, ...(invite.room.access === 'secret' ? { pin } : {}) }, true);
      }}>예</Button>
      <Button variant="secondary" disabled={busy} onclick={() => invite && void act(`/invitations/${invite.id}/respond`, { accept: false })}>아니오</Button>
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
  </aside>
{/if}
{#if notices.length}
  <aside class="invite-toast" aria-label="초대 응답" aria-live="polite">
    {#each notices as notice (notice.id)}<p>{notice.text}</p><Button variant="secondary" disabled={busy} onclick={() => void act(`/notices/${notice.id}/dismiss`, {})}>확인</Button>{/each}
  </aside>
{/if}
<style>
  .room-friends { width: min(var(--layout-content), calc(100% - 32px)); margin: 0 auto var(--spacing-6); padding: var(--spacing-4); border: 1px solid var(--color-festival-line); background: var(--color-festival-panel); }
  .invite-toast { position: fixed; right: var(--spacing-4); bottom: var(--spacing-4); z-index: 40; width: min(360px, calc(100vw - 32px)); padding: var(--spacing-4); border: 1px solid var(--color-festival-gold); background: var(--color-festival-panel); box-shadow: 0 8px 32px #0008; max-height: 70vh; overflow: auto; }
</style>
