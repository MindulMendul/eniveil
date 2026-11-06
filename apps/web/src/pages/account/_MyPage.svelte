<script lang="ts">
  import { Panel, Button } from "../../shared/ui";
  import { onMount, untrack } from 'svelte';
  import NicknameField from '../../features/account/NicknameField.svelte';
  import type { Guest } from '@festival/shared';
  import type { WorkshopStory } from '../workshop/model/_story';
  let { me, accountType, locale, busy, onRename, onLogout, onEdit, onWorkshop }: {
    me: Guest; accountType: string | null; locale: 'ko' | 'en'; busy: boolean;
    onRename: (nickname: string) => Promise<void>; onLogout: () => Promise<void>; onEdit: (id: string) => void; onWorkshop: () => void;
  } = $props();
  let nickname = $state(untrack(() => me.nickname)), confirmLogout = $state(false);
  let items = $state<WorkshopStory[]>([]), total = $state(0), offset = $state(0), loading = $state(true), error = $state('');
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  async function load(next = 0) {
    loading = true; error = '';
    try {
      const response = await fetch(`/api/workshop/stories?view=mine&limit=24&offset=${next}`);
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      items = data.items; total = data.total; offset = next;
    } catch (cause) { error = cause instanceof Error ? cause.message : label('목록을 불러오지 못했어요.', 'Could not load stories.'); }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
</script>
<main class="main account-page">
  <div class="page-heading"><div><p class="eyebrow">MY ACCOUNT</p><h1 class="heading-one">{label('마이페이지', 'My page')}</h1><p class="muted">{me.nickname} · {accountType === 'google' ? 'GOOGLE' : 'GUEST'}</p></div><Button variant="secondary" onclick={onWorkshop}>{label('창작마당으로', 'Workshop')} ↗</Button></div>
  <Panel><h2 class="heading-two">{label('닉네임 변경', 'Change nickname')}</h2>
    <form onsubmit={event => { event.preventDefault(); void onRename(nickname); }}>
      <NicknameField bind:value={nickname} {locale} {busy} />
      <Button type="submit" disabled={busy || nickname.trim() === me.nickname}>{label('닉네임 저장', 'Save nickname')}</Button>
    </form>
  </Panel>
  <Panel><h2 class="heading-two">{label('내가 만든 창작 머미', 'My stories')} ({total})</h2>
    {#if loading}<p role="status">{label('불러오는 중…', 'Loading…')}</p>
    {:else if error}<p role="alert">{error}</p><Button variant="secondary" onclick={() => void load(offset)}>{label('다시 시도', 'Retry')}</Button>
    {:else if !items.length}<p class="muted">{label('아직 만든 작품이 없어요.', 'You have not created any stories yet.')}</p>
    {:else}<ul>{#each items as item (item.id)}<li><div><strong>{item.title}</strong><p class="muted">{item.published ? label('공개', 'Published') : label('비공개 초안', 'Private draft')}</p></div><Button variant="secondary" onclick={() => onEdit(item.id)}>{label('수정하기', 'Edit')} ↗</Button></li>{/each}</ul>{/if}
    {#if total > 24}<nav aria-label={label('내 작품 페이지', 'My stories pages')}><Button variant="secondary" disabled={loading || offset === 0} onclick={() => void load(offset - 24)}>{label('이전', 'Previous')}</Button><Button variant="secondary" disabled={loading || offset + 24 >= total} onclick={() => void load(offset + 24)}>{label('다음', 'Next')}</Button></nav>{/if}
  </Panel>
  <Panel><h2 class="heading-two">{label('로그아웃', 'Sign out')}</h2>
    <p class="muted">{accountType === 'guest' ? label('게스트는 로그아웃하면 닉네임, 만든 작품과 즐겨찾기가 삭제되며 복구할 수 없어요.', 'Signing out deletes your guest nickname, stories and favorites permanently.') : label('다시 구글 로그인하면 내 작품과 닉네임이 유지돼요.', 'Your nickname and stories will be here when you sign in with Google again.')}</p>
    {#if confirmLogout}<p>{label('로그아웃할까요?', 'Sign out now?')}</p><Button disabled={busy} onclick={() => void onLogout()}>{label('로그아웃 확인', 'Confirm sign out')}</Button><Button variant="secondary" onclick={() => confirmLogout = false}>{label('취소', 'Cancel')}</Button>
    {:else}<Button variant="secondary" disabled={busy} onclick={() => confirmLogout = true}>{label('로그아웃', 'Sign out')}</Button>{/if}
  </Panel>
</main>
<style>.account-page{display:grid;gap:var(--spacing-6)}.account-page form{max-width:100%}.account-page h2{margin-bottom:var(--spacing-4)}ul{list-style:none;padding:0}li{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-4);border-bottom:var(--border-thin) solid var(--color-festival-line);padding:var(--spacing-4) 0}li :global(.secondary),.page-heading :global(.secondary){width:auto}nav{display:flex;gap:var(--spacing-4)}</style>
