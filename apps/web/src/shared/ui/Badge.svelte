<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  let { children, class: className = "", tone = "default", ...rest }: HTMLAttributes<HTMLSpanElement> & { children?: Snippet; tone?: "default" | "gold" } = $props();
</script>
<span class={`tag ${tone === "gold" ? "gold" : ""} ${className}`} {...rest}>{@render children?.()}</span>
