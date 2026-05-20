<script>
  import { lightboxSrc } from '../js/state.js';

  function closeLightbox() {
    lightboxSrc.set(null);
  }
</script>

{#if $lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="lightbox open" id="lightbox" on:click={closeLightbox}>
    <button class="lightbox-close" on:click|stopPropagation={closeLightbox}>✕</button>
    <!-- svelte-ignore a11y-missing-attribute -->
    <img id="lightbox-img" src={$lightboxSrc} />
  </div>
{/if}
