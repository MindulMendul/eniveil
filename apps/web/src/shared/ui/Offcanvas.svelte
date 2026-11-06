<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";
  let { children, open, labelledby, onClose }: { children?: Snippet; open: boolean; labelledby: string; onClose: () => void } = $props();
</script>
<Modal {open} {labelledby} {onClose} placement="end">{@render children?.()}</Modal>
