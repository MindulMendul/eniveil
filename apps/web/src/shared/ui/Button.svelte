<script lang="ts">
  type Variant = "primary" | "secondary" | "text" | "dismiss" | "tab" | "scenario";

  let {
    variant = "primary",
    class: className = "",
    disabled = false,
    type = "button",
    ariaLabel,
    title,
    onclick,
  }: {
    variant?: Variant;
    class?: string;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    ariaLabel?: string;
    title?: string;
    onclick?: (event: MouseEvent) => void;
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
  {title}
  {onclick}
>
  <slot />
</button>
