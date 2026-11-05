<script lang="ts">
  let { runId }: { runId: string } = $props();
  let selected = $state(0);
  let saved = $state(false);
  let error = $state("");

  async function submit(rating: number) {
    error = "";
    try {
      const response = await fetch(`/api/game/sessions/${runId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "평점을 저장하지 못했어.");
      selected = rating;
      saved = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "평점을 저장하지 못했어.";
    }
  }
</script>

<section class="mt-6 border-t border-festival-line pt-5" aria-label="스토리 평점">
  <p class="eyebrow">STORY RATING</p>
  <div class="flex justify-center gap-2" role="group" aria-label="1점부터 5점까지 평가">
    {#each [1, 2, 3, 4, 5] as value}
      <button class="cursor-pointer border-0 bg-transparent p-2 text-2xl text-festival-gold disabled:cursor-default" aria-label={`${value}점`} aria-pressed={selected === value} disabled={saved} onclick={() => submit(value)}>{value <= selected ? '★' : '☆'}</button>
    {/each}
  </div>
  {#if saved}<p class="fine">평점을 저장했어. 고마워!</p>{/if}
  {#if error}<p class="fine" role="alert">{error}</p>{/if}
</section>
