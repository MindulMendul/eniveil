<script lang="ts">
  let { class: className = "" }: { class?: string } = $props();
</script>

<section class={`panel ${className}`.trim()}>
  <slot />
</section>
