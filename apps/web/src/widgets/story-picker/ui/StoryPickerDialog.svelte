<script lang="ts">
  import type { Scenario } from "@festival/shared";
  import { ScenarioOption } from "../../../entities/scenario";
  import { Button } from "../../../shared/ui";

  let {
    open,
    scenarios,
    busy,
    connected,
    t,
    onClose,
    onCreate,
  }: {
    open: boolean;
    scenarios: Scenario[];
    busy: boolean;
    connected: boolean;
    t: (key: string) => string;
    onClose: () => void;
    onCreate: (scenarioId: string) => void;
  } = $props();

  function openDialog(node: HTMLDialogElement, initiallyOpen: boolean) {
    if (initiallyOpen && !node.open) node.showModal();
    return {
      update(nextOpen: boolean) {
        if (nextOpen && !node.open) node.showModal();
        if (!nextOpen && node.open) node.close();
      },
    };
  }
</script>

{#if open}
  <div class="modal-backdrop" role="presentation">
    <dialog class="modal" use:openDialog={open} oncancel={onClose} aria-labelledby="picker-title">
      <div class="section-heading">
        <p class="eyebrow section-eyebrow">CHOOSE YOUR STORY</p>
        <Button variant="dismiss" ariaLabel="작품 선택 닫기" onclick={onClose}>×</Button>
      </div>
      <h2 class="modal-title" id="picker-title">{t("chooseStory")}</h2>
      <div class="tabs">
        <span class="tab selected">오리지널 스토리</span>
        <Button variant="tab" class="tab" disabled title="준비 중">
          창작마당 <span class="tag tab-tag">준비 중</span>
        </Button>
      </div>
      <div class="scenario-list">
        {#each scenarios as scenario (scenario.id)}
          <ScenarioOption {scenario} {busy} {connected} onSelect={onCreate} />
        {/each}
      </div>
    </dialog>
  </div>
{/if}
