<script lang="ts">
  import { Button } from "../../shared/ui";
  import { onDestroy, onMount } from "svelte";
  import type { StoryCue } from "@festival/shared";

  let { cues, onComplete }: { cues: StoryCue[]; onComplete: () => void } = $props();
  let cue = $state<StoryCue | null>(null);
  let effect = $state<"fade" | "dissolve" | "cut" | null>(null);
  let waiting = $state(false);
  let effectDurationMs = $state(700);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  function run(index: number) {
    if (index >= cues.length) {
      if (!finished) {
        finished = true;
        onComplete();
      }
      return;
    }

    const nextCue = cues[index];
    if (nextCue.type === "dialogue.show") {
      cue = nextCue;
      waiting = false;
      return;
    }
    if (nextCue.type === "transition.play" || nextCue.type === "wait") {
      cue = null;
      waiting = true;
      if (nextCue.type === "transition.play") {
        effect = nextCue.effect;
        effectDurationMs = nextCue.durationMs;
      }
      timer = setTimeout(() => {
        effect = null;
        waiting = false;
        run(index + 1);
      }, nextCue.durationMs);
      return;
    }
  }

  function advance() {
    if (!cue || waiting) return;
    const index = cues.indexOf(cue);
    run(index + 1);
  }

  function skip() {
    if (timer) clearTimeout(timer);
    effect = null;
    waiting = false;
    run(cues.length);
  }

  onMount(() => run(0));
  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<section class="mx-auto max-w-[680px] border border-festival-line bg-festival-panel p-9 text-center max-[520px]:p-6" aria-live="polite">
  {#if cue?.type === "dialogue.show"}
    <p class="eyebrow">{cue.speaker ?? ""}</p>
    <div class="my-8 border-y border-festival-line py-10">
      <p class="mx-auto my-3 max-w-[520px] font-serif text-[20px] leading-[2] text-festival-copy">{cue.text}</p>
    </div>
    <Button class="primary mx-auto max-w-[400px]" onclick={advance} variant="primary">계속 <span>→</span></Button>
  {:else if waiting}
    <p class="eyebrow">장면 전환</p>
    <div class="my-8 min-h-16 border-y border-festival-line py-5" style={`--cue-duration:${effectDurationMs}ms`} class:cue-fade={effect === "fade"} class:cue-dissolve={effect === "dissolve"}></div>
  {/if}
  <button class="mt-4 cursor-pointer border-0 bg-transparent px-3 py-2 text-xs text-festival-muted hover:text-festival-gold" onclick={skip}>장면 건너뛰기 ↷</button>
</section>

<style>
  .cue-fade { animation: cue-fade var(--cue-duration, 700ms) ease-in-out infinite alternate; }
  .cue-dissolve { animation: cue-fade var(--cue-duration, 700ms) ease-in-out infinite alternate; filter: blur(var(--border-thin)); }
  @keyframes cue-fade { from { opacity: 0.2; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .cue-fade, .cue-dissolve { animation: none; }
  }
</style>
