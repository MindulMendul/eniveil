<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  let { children, as = "p", variant = "body", class: className = "", ...rest }: HTMLAttributes<HTMLElement> & { children?: Snippet; as?: "p" | "span" | "h1" | "h2" | "h3"; variant?: "body" | "muted" | "eyebrow" | "title" } = $props();
  const variants = { body: "text-body leading-body", muted: "muted", eyebrow: "eyebrow", title: "heading-two" };
</script>
<svelte:element this={as} class={`${variants[variant]} ${className}`} {...rest}>{@render children?.()}</svelte:element>
