<script lang="ts">
  import { Button, TextInput } from "../../../shared/ui";

  let {
    code = $bindable(""),
    busy,
    connected,
    onSubmit,
  }: { code?: string; busy: boolean; connected: boolean; onSubmit: () => void } = $props();
</script>

<form onsubmit={(event) => { event.preventDefault(); onSubmit(); }}>
  <label class="input-label join-label" for="code">6자리 초대 코드</label>
  <TextInput
    id="code"
    bind:value={code}
    maxlength={6}
    placeholder="예: A1B2C3"
    autocomplete="off"
  />
  <Button variant="secondary" type="submit" disabled={busy || !connected || code.trim().length !== 6}>
    코드로 입장 ↗
  </Button>
</form>
