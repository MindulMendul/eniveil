<script lang="ts">
  import { Button, TextInput } from "../../../shared/ui";

  let {
    code = $bindable(""),
    busy,
    connected,
    t,
    onSubmit,
  }: { code?: string; busy: boolean; connected: boolean; t: (key: string) => string; onSubmit: () => void } = $props();
</script>

<form onsubmit={(event) => { event.preventDefault(); onSubmit(); }}>
  <label class="input-label join-label" for="code">{t("inviteCodeLabel")}</label>
  <TextInput
    id="code"
    bind:value={code}
    maxlength={6}
    placeholder="예: A1B2C3"
    autocomplete="off"
  />
  <Button variant="secondary" type="submit" disabled={busy || !connected || code.trim().length !== 6}>
    {t("joinByCode")} ↗
  </Button>
</form>
