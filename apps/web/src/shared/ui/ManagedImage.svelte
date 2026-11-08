<script lang="ts">
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { MANAGED_IMAGES, managedImagePath } from '../images';
  let { src, alt, ...attributes }: Omit<HTMLImgAttributes, 'src' | 'srcset' | 'onerror'> & { src?: string | null; alt: string } = $props();
  const source = $derived(managedImagePath(src) ?? MANAGED_IMAGES.invitation);
  let failedSource = $state<string>();
</script>
{#if failedSource !== source}
  <img {...attributes} src={source} {alt} onerror={() => { failedSource = source; }} />
{:else if alt}
  <span role="img" aria-label={alt}>✧</span>
{:else}
  <span aria-hidden="true">✧</span>
{/if}
