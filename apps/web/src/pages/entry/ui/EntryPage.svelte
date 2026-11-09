<script lang="ts">
  import EntryIntro from "./EntryIntro.svelte";
  import { GuestLoginForm } from "../../../features/guest-login";
  import { Button } from "../../../shared/ui";

  let {
    locale, demo = false, onGoogle,
    nickname = $bindable(""),
    busy,
    t,
    onLogin,
  }: {
    locale: "ko" | "en"; demo?: boolean; onGoogle: () => void;
    nickname?: string;
    busy: boolean;
    t: (key: string) => string;
    onLogin: () => void;
  } = $props();
</script>

<main id="main-content" tabindex="-1" class="main flex items-center justify-center">
  <section class="w-full max-w-sm py-8" aria-labelledby="entry-title">
    <EntryIntro {locale} />
    <div class="border-t border-festival-line pt-2">
      <GuestLoginForm bind:nickname {busy} {t} {locale} onSubmit={onLogin} />
    </div>
    <div class="mt-6 border-t border-festival-line pt-1">
      <Button variant="secondary" disabled={busy} onclick={onGoogle}>
        {t("googleLogin")}{demo ? (locale === "en" ? " (test)" : " (테스트)") : ""}
      </Button>
      <Button variant="secondary" disabled={busy} onclick={() => window.alert(t("emailLoginPending"))}>
        {t("emailLogin")}
      </Button>
    </div>
  </section>
</main>
