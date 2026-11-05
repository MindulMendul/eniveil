<script lang="ts">
  import type { Scenario } from "@festival/shared";
  import { Button } from "../../../shared/ui";

  let {
    scenario,
    busy,
    connected,
    onSelect,
  }: { scenario: Scenario; busy: boolean; connected: boolean; onSelect: (id: string) => void } = $props();
</script>

<Button
  variant="scenario"
  disabled={!scenario.available || busy || !connected}
  onclick={() => onSelect(scenario.id)}
>
  <div>
    <span class="eyebrow scenario-label">{scenario.kind === "demo" ? "PLAYTEST" : "ORIGINAL"}</span>
    <h3 class="heading-three scenario-title">{scenario.title}</h3>
    <p class="scenario-description">{scenario.subtitle}</p>
    <small class="scenario-meta">
      {scenario.players}인 · 약 {scenario.minutes}분
      {!scenario.available ? " · 인원·시간 미정의 임시 표시" : ""}
    </small>
  </div>
  <span class="scenario-status">{scenario.available ? "↗" : "집필 중"}</span>
</Button>
