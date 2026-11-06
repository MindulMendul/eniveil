<script lang="ts">
  let { label = "Loading" }: { label?: string } = $props();
</script>
<span class="inline-flex items-center gap-3" role="status"><span class="ui-spinner" aria-hidden="true"></span><span>{label}</span></span>
