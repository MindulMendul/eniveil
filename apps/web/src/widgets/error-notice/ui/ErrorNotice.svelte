<script lang="ts">
  import { Toast } from "../../../shared/ui";
  let { message, onDismiss }: { message: string; onDismiss: () => void } = $props();
</script>
<Toast {message} {onDismiss} kind="error" dismissLabel="알림 닫기" />
