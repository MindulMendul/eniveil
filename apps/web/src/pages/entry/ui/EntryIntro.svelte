<script lang="ts">
  let { locale }: { locale: 'ko' | 'en' } = $props();
  const copy = {
    ko: { name: '애니베일', summary: '애니베일은 혼자 사건을 조사하거나 친구와 역할을 나누어 즐기는 인터랙티브 추리 이야기 플랫폼입니다.' },
    en: { name: 'Eniveil', summary: 'Eniveil is an interactive mystery story platform. Investigate a case alone or play assigned roles with friends.' },
  };
  const text = $derived(copy[locale]);
</script>
<div class="mb-10 text-center">
  <span class="emblem" aria-hidden="true">E</span>
  <h1 id="entry-title" class="heading-two mt-4 text-festival-gold">{text.name}</h1>
  <p class="mt-4">{text.summary}</p>
</div>
