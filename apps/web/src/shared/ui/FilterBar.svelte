<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, label, class: className = "" }: { children?: Snippet; label: string; class?: string } = $props();
</script>
<section class={`panel ui-filter-bar ${className}`} aria-label={label}>{@render children?.()}</section>
