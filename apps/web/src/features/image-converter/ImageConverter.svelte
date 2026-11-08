<script lang="ts">
  import { onDestroy } from 'svelte';
  import { convertToWebp } from './convert';
  import { webpFilename } from './headers';
  let { locale }: { locale: 'ko' | 'en' } = $props();
  const label = (ko: string, en: string) => locale === 'en' ? en : ko;
  let busy = $state(false), error = $state(''), result = $state(''), filename = $state(''), summary = $state('');
  let disposed = false;
  onDestroy(() => { disposed = true; if (result) URL.revokeObjectURL(result); });
  async function convert(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy) return;
    busy = true; error = ''; summary = '';
    if (result) URL.revokeObjectURL(result);
    result = '';
    try {
      const blob = await convertToWebp(file);
      if (disposed) return;
      result = URL.createObjectURL(blob); filename = webpFilename(file.name);
      summary = `${Math.ceil(file.size / 1024)} KB → ${Math.ceil(blob.size / 1024)} KB`;
    } catch (cause) {
      if (disposed) return;
      const code = cause instanceof Error ? cause.message : '';
      error = code === 'size' ? label('이미지는 10 MB 이하여야 해요.', 'Choose an image up to 10 MB.')
        : code === 'dimensions' ? label('이미지는 1,600만 픽셀 이하여야 해요.', 'Choose an image up to 16 million pixels.')
        : label('이미지를 변환하지 못했어요. PNG, JPG, GIF, WebP 파일과 WebP 지원 브라우저가 필요해요.', 'Could not convert. Choose a PNG, JPG, GIF or WebP file in a browser that supports WebP encoding.');
    } finally { if (!disposed) { busy = false; input.value = ''; } }
  }
</script>
<section class="image-converter" aria-labelledby="image-converter-title">
  <h3 id="image-converter-title" class="heading-three">{label('이미지 WebP 변환', 'Convert image to WebP')}</h3>
  <p class="muted">{label('최대 10 MB · 1,600만 픽셀. GIF와 움직이는 이미지는 첫 프레임만 저장돼요.', 'Up to 10 MB · 16 million pixels. Animated images and GIFs become a still first frame.')}</p>
  <label>{label('변환할 이미지', 'Image to convert')}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={busy} onchange={convert} /></label>
  {#if busy}<p role="status">{label('변환 중…', 'Converting…')}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if result}<p role="status">{summary}</p><a class="secondary download" href={result} download={filename}>{label('WebP 내려받기', 'Download WebP')}</a>{/if}
</section>
<style>
.image-converter { display:grid; gap:var(--spacing-4); border:var(--border-thin) solid var(--color-workshop-border); padding:var(--spacing-4); margin:var(--spacing-6) 0; min-width:0 }
label { display:grid; gap:var(--spacing-2); min-width:0 }
input { max-width:100%; min-width:0 }
.download { width:fit-content; max-width:100%; box-sizing:border-box }
</style>
