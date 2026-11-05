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
    <p class="eyebrow">AN INVITATION TO THE UNKNOWN</p>
    <h1 class="heading-one entrance-title">
      {t("invitation")}<br />{t("hiddenStory")} <em class="not-italic text-festival-gold">{t("story")}</em>.
    </h1>
    <p class="intro">{t("invitationDescription")}</p>
    <div class="ticket">
      <span>ADMIT ONE</span><span>비밀을 가진 당신에게</span><span>NO. 001</span>
    </div>
  </section>

  <Panel class="login">
    <p class="eyebrow">ENTER THE FESTIVAL</p>
    <h2 class="heading-two">{t("enterFestival")}</h2>
    <p class="muted">{t("namePrompt")}</p>
    <GuestLoginForm bind:nickname {busy} {t} onSubmit={onLogin} />
    <p class="fine">가입 없이 시작해. 같은 브라우저에서 다시 접속하면<br />참가 정보가 이어져.</p>
  </Panel>
</main>
