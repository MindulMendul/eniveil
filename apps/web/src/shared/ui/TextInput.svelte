<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    id,
    value = $bindable(""),
    maxlength,
    placeholder,
    required = false,
    autocomplete,
  }: {
    id: string;
    value?: string;
    maxlength?: number;
    placeholder?: string;
    required?: boolean;
    autocomplete?: HTMLInputAttributes["autocomplete"];
  } = $props();
</script>

<input
  class="input-field"
  {id}
  bind:value
  {maxlength}
  {placeholder}
  {required}
  {autocomplete}
/>
