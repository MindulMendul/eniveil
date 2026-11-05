<script lang="ts">
  import type { Snapshot } from "@festival/shared";
  import { RoomCard } from "../../../entities/room";
  import { JoinRoomForm } from "../../../features/room-join";
  import { Button, Panel } from "../../../shared/ui";

  let {
    snapshot,
    busy,
    connected,
    t,
    code = $bindable(""),
    onOpenStoryPicker,
    onJoin,
  }: {
    snapshot: Snapshot;
    busy: boolean;
    connected: boolean;
    t: (key: string) => string;
    code?: string;
    onOpenStoryPicker: () => void;
    onJoin: (code?: string) => void;
  } = $props();
</script>

<main class="main">
  <div class="page-heading">
    <div>
      <p class="eyebrow">THE LOBBY</p>
      <h1 class="heading-one">{t("lobbyTitle")}</h1>
      <p class="muted">{t("lobbyDescription")}</p>
    </div>
    <span class="count">{snapshot.rooms.length}개의 방</span>
  </div>

  <div class="lobby-grid">
    <section>
      <div class="section-heading">
        <h2 class="heading-two section-title">{t("openRooms")}</h2><span class="tag">LIVE</span>
      </div>
      {#if !snapshot.rooms.length}
        <div class="empty">
          <span class="empty-symbol">✧</span>
          <h3 class="heading-three">{t("quietFestival")}</h3>
          <p class="empty-copy">{t("createFirstRoom")}</p>
          <Button variant="secondary" class="secondary-compact" onclick={onOpenStoryPicker}>{t("createRoom")} ↗</Button>
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
        <h2 class="heading-two sidebar-title">{t("createStory")}</h2>
        <p class="muted">작품을 선택하고<br />우리만의 방을 만들어.</p>
        <Button disabled={!connected} onclick={onOpenStoryPicker}>{t("createRoom")} <span>＋</span></Button>
      </Panel>
      <Panel>
        <h3 class="heading-three">{t("invited")}</h3>
        <JoinRoomForm bind:code {busy} {connected} {t} onSubmit={() => onJoin()} />
      </Panel>
    </aside>
  </div>
</main>
