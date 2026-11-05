<script lang="ts">
  import type { Member } from "@festival/shared";

  let {
    member,
    currentMemberId,
    hostId,
  }: { member: Member; currentMemberId: string; hostId: string } = $props();
</script>

<div class="member">
  <span class="avatar">{member.nickname.slice(0, 1)}</span>
  <div class="member-info">
    <strong class="member-name">{member.nickname}</strong>
    <small class="member-role">
      {member.id === currentMemberId ? "나" : member.online ? "접속 중" : "재접속 대기 중"}
    </small>
  </div>
  {#if member.id === hostId}<span class="tag gold">방장</span>{/if}
  <span class:live={member.online} class="dot member-status"></span>
</div>
