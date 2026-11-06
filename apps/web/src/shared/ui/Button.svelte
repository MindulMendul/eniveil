<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  type Variant = "primary" | "secondary" | "text" | "dismiss" | "tab" | "scenario";

  let {
    children,
    variant = "primary",
    class: className = "",
    disabled = false,
    type = "button",
    ariaLabel,
    ...rest
  }: HTMLButtonAttributes & { children?: Snippet;
    variant?: Variant;
    ariaLabel?: string;
  } = $props();

  const variantClass: Record<Variant, string> = {
    primary: "primary",
    secondary: "secondary",
    text: "text-button",
    dismiss: "dismiss",
    tab: "tab-button",
    scenario: "scenario",
  };
</script>

<button
  class={`${variantClass[variant]} ${className}`.trim()}
  {disabled}
  {type}
  aria-label={ariaLabel}
  {...rest}
>
  {@render children?.()}
</button>
