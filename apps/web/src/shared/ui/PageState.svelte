<script lang="ts">
  import type { Snippet } from "svelte";
  import StateMessage from "./StateMessage.svelte";
  let { children, kind = "loading", message }: { children?: Snippet; kind?: "loading" | "error" | "empty"; message: string } = $props();
</script>
<main id="main-content" tabindex="-1" class="main center"><StateMessage {kind} {message}>{@render children?.()}</StateMessage></main>
