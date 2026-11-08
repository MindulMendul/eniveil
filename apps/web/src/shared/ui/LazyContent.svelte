<script lang="ts" generics="Module">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';
  let { load, children, locale, embedded = false }: {
    load: () => Promise<Module>;
    children: Snippet<[Module]>;
    locale: 'ko' | 'en';
    embedded?: boolean;
  } = $props();
  const screen = $derived(load());
</script>

{#snippet status(failed: boolean)}
  <div role={failed ? 'alert' : 'status'}>
    <p>{failed
      ? (locale === 'en' ? 'Could not load this page. Please refresh and try again.' : '화면을 불러오지 못했어요. 새로고침해 주세요.')
      : (locale === 'en' ? 'Loading…' : '불러오는 중…')}</p>
    {#if failed}<Button variant="secondary" onclick={() => window.location.reload()}>{locale === 'en' ? 'Refresh' : '새로고침'}</Button>{/if}
  </div>
{/snippet}

{#await screen}
  {#if embedded}{@render status(false)}{:else}<main id="main-content" tabindex="-1" class="main center">{@render status(false)}</main>{/if}
{:then module}
  {@render children(module)}
{:catch}
  {#if embedded}{@render status(true)}{:else}<main id="main-content" tabindex="-1" class="main center">{@render status(true)}</main>{/if}
{/await}
