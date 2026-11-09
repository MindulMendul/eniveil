<script lang="ts">
  import type { RoomSummary } from "@festival/shared";
  import { Button, Card } from "../../../shared/ui";

  let {
    room,
    busy,
    connected,
    onJoin,
  }: { room: RoomSummary; busy: boolean; connected: boolean; onJoin: (code: string) => void } = $props();
</script>

<Card class="room-card">
  <div class="section-heading">
    <span class="eyebrow section-eyebrow">{room.status === "playing" ? "IN PROGRESS" : "WAITING"}</span>
    <span class="muted">{room.count} / {room.capacity}명</span>
  </div>
  <p class="muted">{room.access === "secret" ? "비밀방 · PIN 필요" : room.access === "friends" ? "친구방" : "공개방"}</p>
  <h3 class="heading-three room-title">{room.title}</h3>
  <p class="muted">초대 코드 <strong>{room.code}</strong></p>
  <Button
    variant="secondary"
    disabled={busy || !connected || room.status === "playing" || room.count >= room.capacity}
    onclick={() => onJoin(room.code)}
  >
    {room.status === "playing" ? "게임 진행 중" : room.count >= room.capacity ? "정원 마감" : "참여하기 ↗"}
  </Button>
</Card>
