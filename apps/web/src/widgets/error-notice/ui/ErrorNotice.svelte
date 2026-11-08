<script lang="ts">
  import { Toast } from "../../../shared/ui";
  let { message, onDismiss, locale = 'ko' }: { message: string; onDismiss: () => void; locale?: 'ko' | 'en' } = $props();
</script>
<Toast {message} {onDismiss} kind="error" dismissLabel={locale === 'en' ? 'Dismiss notification' : '알림 닫기'} />
