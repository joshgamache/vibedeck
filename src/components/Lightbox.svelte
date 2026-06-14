<script lang="ts">
  import { appState } from '../js/state.svelte';

  function closeLightbox() {
    appState.lightboxSrc = null;
  }
</script>

{#if appState.lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="lightbox open" id="lightbox" onclick={closeLightbox}>
    <button class="lightbox-close" onclick={(e) => { e.stopPropagation(); closeLightbox(); }}>✕</button>
    <!-- svelte-ignore a11y-missing-attribute -->
    <img id="lightbox-img" src={appState.lightboxSrc} />
  </div>
{/if}
