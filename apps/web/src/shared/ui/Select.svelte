<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";
  let { children, value = $bindable(""), class: className = "", ...rest }: Omit<HTMLSelectAttributes, "value" | "multiple"> & { children?: Snippet; value?: string } = $props();
</script>
<select class={`input-field ${className}`} bind:value {...rest}>{@render children?.()}</select>
