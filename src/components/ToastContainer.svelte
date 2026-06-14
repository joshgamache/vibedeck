<script lang="ts">
  import { toasts } from '../js/toastStore.svelte';
</script>

<div class="toast-container" id="toast-container">
  {#each toasts as toast (toast.id)}
    <div class="toast {toast.type}">
      {toast.message}
    </div>
  {/each}
</div>
