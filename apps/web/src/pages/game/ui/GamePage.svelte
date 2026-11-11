<script lang="ts">
  import GameChat from "../../../features/game/GameChat.svelte";
  import { playTracker } from "../../../shared/lib/play-tracker";
  import { onMount } from "svelte";
  import type { Command, RoomView, SessionView } from "@festival/shared";
  import { GAME_PHASE_LABELS } from "../../../entities/session";
  import { Button, Panel } from "../../../shared/ui";

  let {
    room,
    session,
    host,
    busy,
    connected,
    onCommand,
  }: {
    room: RoomView;
    session: SessionView;
    host: boolean;
    busy: boolean;
    connected: boolean;
    onCommand: (type: Command["type"], targetId?: string) => void;
  } = $props();
  let tracker:ReturnType<typeof playTracker>|undefined;
  let now=$state(Date.now());
  onMount(()=>{const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer);});
  onMount(()=>{tracker=playTracker(session.id);tracker.stage(session.phase);return()=>tracker?.stop();});
  $effect(()=>{tracker?.stage(session.phase);});
</script>

<main id="main-content" tabindex="-1" class="main">
  <div class="page-heading">
    <div>
      <p class="eyebrow">{room.title} · SESSION {session.id.slice(0, 6).toUpperCase()}</p>
      <h1 class="heading-one page-title">{GAME_PHASE_LABELS[session.phase]}</h1>
      {#if session.phaseEndsAt}<p class="muted">남은 시간 {Math.max(0, Math.ceil((session.phaseEndsAt-now)/1000))}초</p>{/if}
    </div>
    <span class="tag">시나리오 v{session.scenarioVersion}</span>
  </div>

  <ol class="steps m-0 list-none p-0" aria-label="게임 진행 단계">
    {#each Object.entries(GAME_PHASE_LABELS) as [key, label], index (key)}
      <li class:active={session.phase === key} class="step" aria-current={session.phase === key ? "step" : undefined}>{String(index + 1).padStart(2, "0")} {label}</li>
    {/each}
  </ol>

  <div class="lobby-grid">
    <Panel class="story">
      <p class="eyebrow">{session.phase === "briefing" ? "YOUR SECRET" : "THE EVIDENCE"}</p>
      {#if session.phase === "briefing"}
        <h2 class="heading-two">너의 역할은 ‘{session.role.name}’</h2>
        <p class="narrative">{session.role.secret}</p>
        <p class="fine">이 정보는 너에게만 보여. 어떻게 이야기할지는 네가 결정해.</p>
        {#if session.items.length}
          <p class="eyebrow mt-4">ITEMS</p>
          {#each session.items as item}
            <div class="clue">
              <span class="clue-label">{item.name}</span>
              <p class="clue-text">{item.description}</p>
            </div>
          {/each}
        {/if}
      {:else if session.phase === "first_investigation" || session.phase === "second_investigation"}
        <h2 class="heading-two">{session.phase === "first_investigation" ? "첫 번째 단서를 살펴볼 시간" : "두 번째 단서를 살펴볼 시간"}</h2>
        <p class="muted">확인한 단서 {session.collectedClueCount}/{session.availableClueCount}</p>
        {#if session.collectedClueCount < session.availableClueCount}
          <Button disabled={busy || !connected} onclick={() => onCommand("collect-clue")}>단서 조사하기 →</Button>
        {/if}
        {#each session.clues as clue, index (index)}
          <div class="clue">
            <span class="clue-label">단서 {index + 1}</span>
            <p class="clue-text">{clue}</p>
          </div>
        {/each}

      {:else if session.phase === "meeting"}
        <h2 class="heading-two">각자의 추리를 나눠 볼 시간</h2>
        <p class="muted">{session.meetingPrompt ?? "참가자들과 대화하며 단서를 정리해 봐."}</p>
      {:else if session.phase === "final_choice"}
        <h2 class="heading-two">누가 초대장을 옮겼을까?</h2>
        <p class="muted">투표는 한 번만 가능하고, 모두 완료하면 진상이 공개돼.</p>
        <div class="votes">
          {#if session.finalChoices.length}
            {#each session.finalChoices as choice (choice.id)}
              <Button variant="secondary" disabled={busy || !connected || !!session.selectedFinalChoiceId} onclick={() => onCommand("choose-final", choice.id)}>{choice.label} →</Button>
            {/each}
          {:else}
          {#each room.members as member (member.id)}
            <Button
              variant="secondary"
              disabled={busy || !connected || session.hasVoted}
              onclick={() => onCommand("vote", member.id)}
            >
              {member.nickname} 지목하기 →
            </Button>
          {/each}
          {/if}
        </div>
        <p class="fine">
          {session.hasVoted ? "투표 완료. 다른 참가자들을 기다리고 있어." : "증언과 단서를 생각하고 한 명을 골라 줘."}
          ({session.voteCount}/{room.count})
        </p>
      {:else}
        <h2 class="heading-two">사라진 초대장의 행방</h2>
        <p class="narrative">{session.result?.answer}</p>
        {#each session.result?.votes ?? [] as vote, index (index)}
          <p class="vote-result">{vote.voter} <span class="vote-target">→</span> {vote.target}</p>
        {/each}
      {/if}
    </Panel>

    <aside class="sidebar">
      <Panel>
        <p class="eyebrow">PRIVATE ROLE CARD</p>
        <details open={session.phase === "briefing"} ontoggle={event=>tracker?.record('inspect',event.currentTarget.open?'role_open':'role_close')}>
          <summary class="summary">{session.role.name} · 내 비밀 보기</summary>
          <p class="muted detail-copy">{session.role.secret}</p>
        </details>
      </Panel>
      <Panel>
        <h3 class="heading-three">다음 진행</h3>
        {#if host}
          {#if session.phase !== "final_choice" && session.phase !== "reveal"}
            <p class="muted">모두 준비됐는지 대화로 확인하고 진행해 줘.</p>
            <Button disabled={busy || !connected} onclick={() => onCommand("advance")}>
              {session.phase === "briefing" ? "1차 단서 수집 시작하기" : session.phase === "first_investigation" ? "회의 시작하기" : session.phase === "meeting" ? "2차 단서 수집 시작하기" : "최종 선택 시작하기"} →
            </Button>
          {:else}
            <p class="muted">모두 투표하면 결말이 공개돼.</p>
          {/if}
        {:else}
          <p class="muted">
            {session.phase === "final_choice" ? "모두 선택하면 결말이 공개돼." : "방장이 다음 단계로 진행할 거야."}
          </p>
        {/if}
      </Panel>
    </aside>
  </div>
  {#if session.phase === "first_investigation" || session.phase === "meeting" || session.phase === "second_investigation"}<GameChat sessionId={session.id} members={room.members}/>{/if}
</main>
