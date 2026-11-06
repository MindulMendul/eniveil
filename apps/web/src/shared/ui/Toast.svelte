<script lang="ts">
  import Button from "./Button.svelte";
  let { message, onDismiss, dismissLabel = "Close", kind = "status" }: { message: string; onDismiss?: () => void; dismissLabel?: string; kind?: "status" | "error" } = $props();
</script>
<div class="notice" role={kind === "error" ? "alert" : "status"}>
  <span class="min-w-0">{message}</span>
  {#if onDismiss}<Button variant="dismiss" ariaLabel={dismissLabel} onclick={onDismiss}>×</Button>{/if}
</div>
