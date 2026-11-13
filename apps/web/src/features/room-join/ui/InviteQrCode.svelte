<script lang="ts">
  import QRCode from "qrcode";
  import { onMount } from "svelte";

  let { code, locale }: { code: string; locale: "ko" | "en" } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let unavailable = $state(false);
  const path = $derived(`/?room=${encodeURIComponent(code)}`);

  onMount(() => {
    let disposed = false;
    const render = async () => {
      if (!canvas) return;
      try {
        await QRCode.toCanvas(canvas, new URL(path, window.location.origin).href, {
          width: 224,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#17120d", light: "#fffdf8" },
        });
        if (!disposed) unavailable = false;
      } catch {
        if (!disposed) unavailable = true;
      }
    };
    void render();
    return () => { disposed = true; };
  });
</script>

<section class="invite-qr" aria-labelledby="invite-qr-title">
  <h3 id="invite-qr-title" class="heading-three">{locale === "en" ? "Scan to join" : "QR로 참여하기"}</h3>
  <p class="fine">{locale === "en" ? "Scan this code to open the invite link." : "카메라로 스캔하면 초대 링크를 열 수 있어."}</p>
  {#if unavailable}
    <p class="fine" role="status">{locale === "en" ? "QR code could not load. Use the invite link instead." : "QR 코드를 불러오지 못했어. 초대 링크를 사용해 줘."}</p>
  {:else}
    <canvas bind:this={canvas} aria-label={locale === "en" ? "QR code for this room’s invite link" : "이 방의 초대 링크 QR 코드"}>{locale === "en" ? "QR code for this room’s invite link" : "이 방의 초대 링크 QR 코드"}</canvas>
  {/if}
  <a class="fine invite-fallback" href={path}>{locale === "en" ? "Open invite link" : "초대 링크 열기"}</a>
</section>

<style>
  .invite-qr { margin-top: var(--spacing-5); border-top: 1px solid var(--color-festival-line); padding-top: var(--spacing-4); }
  .invite-qr h3 { margin: 0; }
  canvas { display: block; width: min(224px, 100%); height: auto; margin: var(--spacing-3) auto; image-rendering: pixelated; }
  .invite-fallback { display: block; text-align: center; }
</style>
