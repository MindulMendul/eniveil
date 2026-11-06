<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  let { children, class: className = "", variant = "primary", ...rest }: HTMLAnchorAttributes & {
    children?: Snippet;
    variant?: "primary" | "secondary";
  } = $props();
</script>
<a class={`${variant} no-underline ${className}`} {...rest}>{@render children?.()}</a>
