<script lang="ts">
  import type { Snippet } from "svelte";
  import { onDestroy } from "svelte";
  import type { HTMLDialogAttributes } from "svelte/elements";
  let { children, open, element = $bindable(), labelledby, onClose, class: className = "", placement = "center", ...rest }: Omit<HTMLDialogAttributes, "open" | "onclose" | "oncancel"> & { children?: Snippet; open?: boolean; element?: HTMLDialogElement; labelledby: string; onClose: () => void; placement?: "center" | "end" } = $props();
  let opener: HTMLElement | null = null;
  function trapTab(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !element) return;
    if (event.target instanceof Element && event.target.closest('dialog') !== element) return;
    const controls = [...element.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length > 0 && !node.closest('[hidden],[inert]'));
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); element.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function restoreFocus() {
    const target = opener;
    queueMicrotask(() => {
      const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      if (target?.isConnected && (!dialog || dialog.contains(target))) { target.focus(); return; }
      const fallback = dialog?.querySelector('button, input, select, [tabindex="0"]') ?? document.getElementById('main-content');
      if (fallback instanceof HTMLElement) fallback.focus();
    });
  }
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
    restoreFocus();
  });
</script>
<dialog bind:this={element} onkeydown={trapTab} class={`modal ui-modal ${placement === "end" ? "ui-offcanvas" : ""} ${className}`} aria-labelledby={labelledby} onbeforetoggle={event => {
  if (event.newState === 'open') opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}} onclose={() => { if (open !== false) onClose(); restoreFocus(); }} oncancel={(event) => {
  if (open !== undefined) {
    event.preventDefault();
    onClose();
  }
}} {...rest}>
  {@render children?.()}
</dialog>
