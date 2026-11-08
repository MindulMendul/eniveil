<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  let { value = $bindable(""), class: className = "", ...rest }: HTMLTextareaAttributes = $props();
</script>
<textarea class={`input-field ${className}`} bind:value {...rest}></textarea>
