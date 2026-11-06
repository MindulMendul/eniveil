<script lang="ts">
  import { GuestLoginForm } from "../../../features/guest-login";
  import { Panel } from "../../../shared/ui";

  let {
    nickname = $bindable(""),
    busy,
    t,
    onLogin,
  }: {
    nickname?: string;
    busy: boolean;
    t: (key: string) => string;
    onLogin: () => void;
  } = $props();
</script>

<main class="main entrance">
  <section>
    <p class="eyebrow">INTERACTIVE STORY PLATFORM</p>
    <h1 class="heading-one entrance-title">
      {t("entryHeadline")}<br /><em class="not-italic text-festival-gold">{t("entryAccent")}</em>.
    </h1>
    <p class="intro">{t("entryDescription")}</p>
    <div class="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-festival-line pt-4 text-[10px] tracking-[1.5px] text-festival-muted">
      <span>{t("entryEdition")}</span>
    </div>
  </section>

  <Panel class="login">
    <p class="eyebrow">START PLAYING</p>
    <h2 class="heading-two">{t("startPlaying")}</h2>
    <p class="muted">{t("namePrompt")}</p>
    <GuestLoginForm bind:nickname {busy} {t} onSubmit={onLogin} />
    <p class="fine">{t("entryHint")}</p>
  </Panel>
</main>
