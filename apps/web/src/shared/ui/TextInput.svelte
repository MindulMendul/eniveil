<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  let { value = $bindable(""), class: className = "", ...rest }: Omit<HTMLInputAttributes, "value" | "type"> & { value?: string; type?: "text" | "search" | "url" | "email" | "password" | "tel" | "date" } = $props();
</script>
<input class={`input-field ${className}`} bind:value {...rest} />
