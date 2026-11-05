<script lang="ts">
  import { Button, TextInput } from "../../../shared/ui";

  let {
    nickname = $bindable(""),
    busy,
    onSubmit,
  }: { nickname?: string; busy: boolean; onSubmit: () => void } = $props();
</script>

<form onsubmit={(event) => { event.preventDefault(); onSubmit(); }}>
  <label class="input-label" for="nickname">참가자 이름</label>
  <TextInput
    id="nickname"
    bind:value={nickname}
    maxlength={20}
    placeholder="이름을 입력해 줘"
    required
    autocomplete="nickname"
  />
  <Button type="submit" disabled={busy || !nickname.trim()}>
    {busy ? "입장 중…" : "게스트로 시작하기"} <span>↗</span>
  </Button>
</form>
