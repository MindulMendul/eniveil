<script lang="ts">
  import { Button, Modal } from '../../shared/ui';
  import FriendsPanel from './FriendsPanel.svelte';
  let { locale, accountId, onAuthLost }: { locale: 'ko' | 'en'; accountId: string; onAuthLost: () => void } = $props();
  let open = $state(false);
  const titleId = $props.id();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  function backdrop(event: MouseEvent & { currentTarget: EventTarget & HTMLDialogElement }) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) open = false;
  }
</script>
<div class="friend-spacer" aria-hidden="true"></div>
<Button class="friend-fab" aria-haspopup="dialog" aria-expanded={open} onclick={() => open = true}>{label('친구', 'Friends')}</Button>
{#if open}
  <Modal open={true} placement="end" class="friend-drawer" labelledby={titleId} onClose={() => open = false} onclick={backdrop}>
    <div class="friend-title"><h2 id={titleId} class="heading-two">{label('친구', 'Friends')}</h2><Button variant="dismiss" aria-label={label('친구 목록 닫기', 'Close friends')} onclick={() => open = false}>×</Button></div>
    <FriendsPanel {locale} {accountId} poll={true} onAuthLost={() => { open = false; onAuthLost(); }} />
  </Modal>
{/if}
<style>
  :global(.friend-fab) { position:fixed; right:1rem; bottom:1rem; z-index:30; width:auto; min-width:4rem; margin:0; }
  :global(.friend-drawer) { width:min(calc(100% - 1.5rem),var(--layout-modal)); }
  .friend-spacer { height:5rem; }
  .friend-title { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
</style>
