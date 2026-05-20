<script>
  import { toasts } from '../js/toastStore.js';
</script>

<div class="toast-container" id="toast-container">
  {#each $toasts as toast (toast.id)}
    <div class="toast {toast.type}">
      {toast.message}
    </div>
  {/each}
</div>
