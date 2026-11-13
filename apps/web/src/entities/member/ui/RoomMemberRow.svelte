<script lang="ts">
  import type { Member } from "@festival/shared";

  let {
    member,
    currentMemberId,
    hostId,
  }: { member: Member; currentMemberId: string; hostId: string } = $props();
  let now = $state(Date.now());
  let seconds = $derived(member.reconnectExpiresAt ? Math.max(0, Math.ceil((member.reconnectExpiresAt - now) / 1000)) : 0);
  $effect(() => {
    if (member.online || !member.reconnectExpiresAt) return;
    const timer = setInterval(() => now = Date.now(), 1000);
    return () => clearInterval(timer);
  });
</script>

<div class="member">
  <span class="avatar">{member.nickname.slice(0, 1)}</span>
  <div class="member-info">
    <strong class="member-name">{member.nickname}</strong>
    <small class="member-role">
      {member.id === currentMemberId ? "나" : member.online ? "접속 중" : seconds > 0 ? `재접속 대기 · ${seconds}초` : "연결 만료 처리 중"}
    </small>
  </div>
  {#if member.id === hostId}<span class="tag gold">방장</span>{/if}
  <span class:live={member.online} class="dot member-status"></span>
</div>
