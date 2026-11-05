<script lang="ts">
  import type { Snapshot } from "@festival/shared";
  import { RoomCard } from "../../../entities/room";
  import { JoinRoomForm } from "../../../features/room-join";
  import { Button, Panel } from "../../../shared/ui";

  let {
    snapshot,
    busy,
    connected,
    code = $bindable(""),
    onOpenStoryPicker,
    onJoin,
  }: {
    snapshot: Snapshot;
    busy: boolean;
    connected: boolean;
    code?: string;
    onOpenStoryPicker: () => void;
    onJoin: (code?: string) => void;
  } = $props();
</script>

<main class="main">
  <div class="page-heading">
    <div>
      <p class="eyebrow">THE LOBBY</p>
      <h1 class="heading-one">오늘의 축제</h1>
      <p class="muted">함께할 사람들을 모으고, 첫 번째 이야기를 열어 봐.</p>
    </div>
    <span class="count">{snapshot.rooms.length}개의 방</span>
  </div>

  <div class="lobby-grid">
    <section>
      <div class="section-heading">
        <h2 class="heading-two section-title">열려 있는 방</h2><span class="tag">LIVE</span>
      </div>
      {#if !snapshot.rooms.length}
        <div class="empty">
          <span class="empty-symbol">✧</span>
          <h3 class="heading-three">아직 조용한 축제야.</h3>
          <p class="empty-copy">첫 번째 방을 만들고 친구를 초대해 봐.</p>
          <Button variant="secondary" class="secondary-compact" onclick={onOpenStoryPicker}>첫 방 만들기 ↗</Button>
        </div>
      {:else}
        <div class="rooms">
          {#each snapshot.rooms as room (room.id)}
            <RoomCard {room} {busy} {connected} onJoin={onJoin} />
          {/each}
        </div>
      {/if}
    </section>

    <aside class="sidebar">
      <Panel>
        <p class="eyebrow">HOST A STORY</p>
        <h2 class="heading-two sidebar-title">이야기 시작하기</h2>
        <p class="muted">작품을 선택하고<br />우리만의 방을 만들어.</p>
        <Button disabled={!connected} onclick={onOpenStoryPicker}>방 만들기 <span>＋</span></Button>
      </Panel>
      <Panel>
        <h3 class="heading-three">초대받았어?</h3>
        <JoinRoomForm bind:code {busy} {connected} onSubmit={() => onJoin()} />
      </Panel>
    </aside>
  </div>
</main>
