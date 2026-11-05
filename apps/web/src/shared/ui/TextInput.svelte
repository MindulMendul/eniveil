<script lang="ts">
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
    autocomplete?: string;
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
