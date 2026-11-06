<script lang="ts">
  import { Button, TextInput } from "../../../shared/ui";

  let {
    nickname = $bindable(""),
    busy,
    t,
    onSubmit,
  }: { nickname?: string; busy: boolean; t: (key: string) => string; onSubmit: () => void } = $props();
</script>

<form onsubmit={(event) => { event.preventDefault(); onSubmit(); }}>
  <label class="input-label" for="nickname">{t("guestName")}</label>
  <TextInput
    id="nickname"
    bind:value={nickname}
    maxlength={20}
    placeholder={t("namePlaceholder")}
    required
    autocomplete="nickname"
  />
  <Button type="submit" disabled={busy || !nickname.trim()}>
    {busy ? t("guestLoggingIn") : t("guestStart")} <span aria-hidden="true">↗</span>
  </Button>
</form>
