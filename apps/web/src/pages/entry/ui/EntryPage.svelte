<script lang="ts">
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

<main class="main flex items-center justify-center">
  <section class="w-full max-w-sm py-8" aria-labelledby="entry-title">
    <div class="mb-10 text-center">
      <span class="emblem" aria-hidden="true">S</span>
      <p class="eyebrow mt-4">{t("brand")}</p>
      <h1 id="entry-title" class="heading-two text-festival-gold">{t("entryInvitation")}</h1>
    </div>
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
