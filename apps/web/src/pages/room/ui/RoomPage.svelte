<script lang="ts">
  import type { Command, RoomView, Snapshot } from "@festival/shared";
  import { RoomMemberRow } from "../../../entities/member";
  import { Button, Panel } from "../../../shared/ui";

  let {
    snapshot,
    room,
    host,
    canStart,
    busy,
    connected,
    copied,
    onCopy,
    onCommand,
  }: {
    snapshot: Snapshot;
    room: RoomView;
    host: boolean;
    canStart: boolean;
    busy: boolean;
    connected: boolean;
    copied: boolean;
    onCopy: () => void;
    onCommand: (type: Command["type"], targetId?: string) => void;
  } = $props();
</script>

<main class="main">
  <p class="eyebrow">BEFORE THE CURTAIN RISES</p>
  <div class="page-heading">
    <div>
      <h1 class="heading-one page-title">{room.title}</h1>
      <p class="muted">
        {room.scenario.kind === "demo" ? "기능 검증용 테스트 시나리오" : "오리지널 스토리"}
        · {room.capacity}인 · 약 {room.scenario.minutes}분
      </p>
    </div>
    <Button variant="text" disabled={busy || !connected} onclick={() => onCommand("leave")}>방 나가기 ↗</Button>
  </div>

  <div class="lobby-grid">
    <Panel>
      <div class="section-heading">
        <h2 class="heading-two section-title">참가자</h2>
        <span class="count">{room.count} / {room.capacity}</span>
      </div>
      <div class="members">
        {#each room.members as member (member.id)}
          <RoomMemberRow member={member} currentMemberId={snapshot.me.id} hostId={room.hostId} />
        {/each}
        {#each Array(room.capacity - room.count) as _}
          <div class="member vacant">
            <span class="avatar vacant-avatar">＋</span><span>누군가의 입장을 기다리는 중</span>
          </div>
        {/each}
      </div>
    </Panel>

    <aside class="sidebar">
      <Panel>
        <p class="eyebrow">INVITE YOUR FRIENDS</p>
        <h2 class="heading-two sidebar-title">초대 코드</h2>
        <p class="invite-code">{room.code}</p>
        <Button variant="secondary" onclick={onCopy}>{copied ? "초대 링크 복사 완료" : "초대 링크 복사 ↗"}</Button>
      </Panel>
      <Panel>
        <p class="muted">
          {canStart ? "모든 참가자가 모였어. 이야기를 시작해도 좋아." : "필요한 인원이 모두 접속하면 시작할 수 있어."}
        </p>
        {#if host}
          <Button disabled={!canStart || !connected || busy} onclick={() => onCommand("start")}>
            게임 시작 <span>→</span>
          </Button>
        {:else}
          <p class="fine">방장이 게임을 시작하기를 기다리는 중</p>
        {/if}
      </Panel>
    </aside>
  </div>
</main>
