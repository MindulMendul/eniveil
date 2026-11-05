<script lang="ts">
  import { Button } from "../../../shared/ui";
  let { message, onDismiss }: { message: string; onDismiss: () => void } = $props();
</script>

<div class="notice" role="alert">
  {message}
  <Button variant="dismiss" ariaLabel="알림 닫기" onclick={onDismiss}>×</Button>
</div>
