<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  let { children, class: className = "", ...rest }: HTMLAttributes<HTMLElement> & { children?: Snippet } = $props();
</script>
<article class={`panel min-w-0 ${className}`} {...rest}>{@render children?.()}</article>
