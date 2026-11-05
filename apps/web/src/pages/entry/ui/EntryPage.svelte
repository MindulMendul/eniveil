<script lang="ts">
  import { GuestLoginForm } from "../../../features/guest-login";
  import { Panel } from "../../../shared/ui";

  let {
    nickname = $bindable(""),
    busy,
    onLogin,
  }: { nickname?: string; busy: boolean; onLogin: () => void } = $props();
</script>

<main class="main entrance">
  <section>
    <p class="eyebrow">AN INVITATION TO THE UNKNOWN</p>
    <h1 class="heading-one entrance-title">
      모두에게는<br />숨겨 둔 <em class="not-italic text-festival-gold">이야기</em>가 있다.
    </h1>
    <p class="intro">각자의 비밀, 엇갈리는 증언.<br />같은 축제에 모인 사람들과 진실을 맞춰 봐.</p>
    <div class="ticket">
      <span>ADMIT ONE</span><span>비밀을 가진 당신에게</span><span>NO. 001</span>
    </div>
  </section>

  <Panel class="login">
    <p class="eyebrow">ENTER THE FESTIVAL</p>
    <h2 class="heading-two">축제에 입장하기</h2>
    <p class="muted">오늘 밤, 어떤 이름으로 불릴까?</p>
    <GuestLoginForm bind:nickname {busy} onSubmit={onLogin} />
    <p class="fine">가입 없이 시작해. 같은 브라우저에서 다시 접속하면<br />참가 정보가 이어져.</p>
  </Panel>
</main>
