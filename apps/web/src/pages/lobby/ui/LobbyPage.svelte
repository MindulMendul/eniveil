<script lang="ts">
  import type { Snapshot } from "@festival/shared";
  import { RoomCard } from "../../../entities/room";
  import { JoinRoomForm } from "../../../features/room-join";
  import { Button } from "../../../shared/ui";

  let {
    snapshot,
    busy,
    connected,
    t,
    code = $bindable(""),
    onSelectMode,
    onJoin,
  }: {
    snapshot: Snapshot;
    busy: boolean;
    connected: boolean;
    t: (key: string) => string;
    code?: string;
    onSelectMode: (modeId: string) => void;
    onJoin: (code?: string) => void;
  } = $props();

  let joinOpen = $state(false);
  $effect(() => {
    if (code.trim()) joinOpen = true;
  });
</script>

<main id="main-content" tabindex="-1" class="main !pt-5 max-mobile:!pt-4">
  <h1 class="sr-only">{t("lobbyTitle")}</h1>
  <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
    <Button
      class="!m-0 !w-auto !px-3 !py-2"
      disabled={busy || !connected}
      onclick={() => onSelectMode("host")}
    >
      <span aria-hidden="true">＋</span> {t("createRoom")}
    </Button>
    <details class="min-w-0 max-w-full" bind:open={joinOpen}>
      <summary class="min-h-11 cursor-pointer py-3 text-body-sm text-festival-muted hover:text-festival-gold">{t("joinByCode")}</summary>
      <div class="mt-2 border border-festival-line bg-festival-panel p-4">
        <JoinRoomForm bind:code {busy} {connected} {t} onSubmit={() => onJoin()} />
      </div>
    </details>
  </div>

  <section class="mt-8 border-t border-festival-line pt-5" aria-labelledby="lobby-rooms-title">
    <div class="section-heading mb-4">
      <h2 id="lobby-rooms-title" class="heading-two section-title">{t("openRooms")}</h2>
      <span class="count">{snapshot.rooms.length}</span>
    </div>
    {#if !snapshot.rooms.length}
      <p class="muted" role="status">{t("noOpenRooms")}</p>
    {:else}
      <div class="rooms">
        {#each snapshot.rooms as room (room.id)}
          <RoomCard {room} {busy} {connected} onJoin={onJoin} />
        {/each}
      </div>
    {/if}
  </section>
</main>
