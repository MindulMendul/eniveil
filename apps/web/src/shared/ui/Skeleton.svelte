<script lang="ts">
  let { class: className = "" }: { class?: string } = $props();
</script>
<div class={`ui-skeleton ${className}`} aria-hidden="true"></div>
