<script lang="ts">
  import type { Snippet } from "svelte";
  import Spinner from "./Spinner.svelte";
  let { children, kind = "empty", message, class: className = "" }: { children?: Snippet; kind?: "empty" | "loading" | "error"; message: string; class?: string } = $props();
</script>
<div class={`empty ${className}`} role={kind === "error" ? "alert" : "status"}>
  {#if kind === "loading"}<Spinner label={message} />{:else}<p>{message}</p>{/if}
  {@render children?.()}
</div>
