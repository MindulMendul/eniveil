<script lang="ts">
  import NicknameField from "../../account/NicknameField.svelte";
  import { Button } from "../../../shared/ui";

  let {
    locale,
    nickname = $bindable(""),
    busy,
    t,
    onSubmit,
  }: { locale: "ko" | "en"; nickname?: string; busy: boolean; t: (key: string) => string; onSubmit: () => void } = $props();
</script>

<form onsubmit={(event) => { event.preventDefault(); onSubmit(); }}>
  <NicknameField id="nickname" bind:value={nickname} {locale} {busy} />
  <Button type="submit" disabled={busy || !nickname.trim()}>
    {busy ? t("guestLoggingIn") : t("guestStart")} <span aria-hidden="true">↗</span>
  </Button>
</form>
