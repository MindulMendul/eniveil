<script lang="ts">
  import type { Snippet } from "svelte";
  import { onDestroy } from "svelte";
  import type { HTMLDialogAttributes } from "svelte/elements";
  let { children, open, element = $bindable(), labelledby, onClose, class: className = "", placement = "center", ...rest }: Omit<HTMLDialogAttributes, "open" | "onclose" | "oncancel"> & { children?: Snippet; open?: boolean; element?: HTMLDialogElement; labelledby: string; onClose: () => void; placement?: "center" | "end" } = $props();
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (!element || open === undefined) return;
    if (open && !element.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    }
    if (!open && element.open) element.close();
  });
  onDestroy(() => {
    if (element?.open) element.close();
    const target = opener;
    queueMicrotask(() => { if (target?.isConnected) target.focus(); });
  });
</script>
<dialog bind:this={element} class={`modal ui-modal ${placement === "end" ? "ui-offcanvas" : ""} ${className}`} aria-labelledby={labelledby} onclose={() => { if (open !== false) onClose(); }} oncancel={(event) => { if (open !== undefined) event.preventDefault(); onClose(); }} {...rest}>
  {@render children?.()}
</dialog>
