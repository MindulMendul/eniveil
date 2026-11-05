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
    modes,
    code = $bindable(""),
    onSelectMode,
    onJoin,
  }: {
    snapshot: Snapshot;
    busy: boolean;
    connected: boolean;
    t: (key: string) => string;
    modes: { id: string; titleKey: string; descriptionKey: string; actionKey: string }[];
    code?: string;
    onSelectMode: (modeId: string) => void;
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

  <section class="mb-8">
    <div class="section-heading">
      <h2 class="heading-two section-title">{t("gameModes")}</h2>
      <span class="tag">PLAY</span>
    </div>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each modes as mode (mode.id)}
        <Panel>
          <p class="eyebrow">{t("gameModeLabel")}</p>
          <h3 class="heading-three">{t(mode.titleKey)}</h3>
          <p class="muted mb-5">{t(mode.descriptionKey)}</p>
          {#if mode.id === "join"}
            <JoinRoomForm bind:code {busy} {connected} {t} onSubmit={() => onJoin()} />
          {:else}
            <Button
              class="w-full"
              disabled={mode.id === "host" && !connected}
              onclick={() => onSelectMode(mode.id)}
            >
              {t(mode.actionKey)} <span>↗</span>
            </Button>
          {/if}
        </Panel>
      {/each}
    </div>
  </section>

  <section>
    <div class="section-heading">
      <h2 class="heading-two section-title">{t("openRooms")}</h2>
      <span class="tag">LIVE</span>
    </div>
    {#if !snapshot.rooms.length}
      <div class="empty">
        <span class="empty-symbol">✧</span>
        <h3 class="heading-three">{t("quietFestival")}</h3>
        <p class="empty-copy">{t("createFirstRoom")}</p>
      </div>
    {:else}
      <div class="rooms">
        {#each snapshot.rooms as room (room.id)}
          <RoomCard {room} {busy} {connected} onJoin={onJoin} />
        {/each}
      </div>
    {/if}
  </section>
</main>
