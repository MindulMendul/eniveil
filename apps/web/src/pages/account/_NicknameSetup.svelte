<script lang="ts">
  import { Button, Panel } from '../../shared/ui';
  import NicknameField from '../../features/account/NicknameField.svelte';
  let { locale, busy, nickname = $bindable(''), onRename, onLogout }: {
    locale: 'ko' | 'en';
    busy: boolean;
    nickname?: string;
    onRename: (nickname: string) => void;
    onLogout: () => void;
  } = $props();
</script>

<main id="main-content" tabindex="-1" class="main">
  <Panel>
    <h1 class="heading-one">{locale === 'en' ? 'Choose your nickname' : '닉네임을 정해 주세요'}</h1>
    <form onsubmit={event => { event.preventDefault(); onRename(nickname); }}>
      <NicknameField bind:value={nickname} {locale} {busy} />
      <Button type="submit" disabled={busy}>{locale === 'en' ? 'Save and continue' : '저장하고 시작하기'}</Button>
    </form>
    <Button variant="secondary" disabled={busy} onclick={onLogout}>{locale === 'en' ? 'Sign out' : '로그아웃'}</Button>
  </Panel>
</main>
