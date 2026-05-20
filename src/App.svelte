<script>
  import { onMount } from 'svelte';
  import { activeTab, importModalOpen, decks, currentDeckId, drawState, STORAGE_KEYS } from './js/state.js';
  import { initDB, iAll } from './js/db.js';

  import DrawView from './components/DrawView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import LibraryView from './components/LibraryView.svelte';
  import ImportModal from './components/ImportModal.svelte';
  import SplitModal from './components/SplitModal.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import ToastContainer from './components/ToastContainer.svelte';

  onMount(async () => {
    // Configure PDF.js Global Worker
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Initialize Database
    await initDB();

    // Load initial decks
    const loadedDecks = await iAll('decks');
    decks.set(loadedDecks);

    // Load drawState cache
    const dsList = await iAll('drawState');
    drawState.update(store => {
      dsList.forEach(d => {
        store[d.deckId] = d;
      });
      return store;
    });

    // Set initial deck selection
    const lastId = localStorage.getItem(STORAGE_KEYS.lastDeckId);
    if (lastId && loadedDecks.some(d => d.id === lastId)) {
      currentDeckId.set(lastId);
    } else if (loadedDecks.length) {
      currentDeckId.set(loadedDecks[0].id);
    }
  });
</script>

<div id="app">
  <header>
    <div class="logo">The Deck <span>/ MCG Card Reader</span></div>
    <button class="btn btn-ghost" on:click={() => importModalOpen.set(true)}>+ Import</button>
  </header>

  <nav>
    <button class="nav-tab" class:active={$activeTab === 'draw'} on:click={() => activeTab.set('draw')}>Draw</button>
    <button class="nav-tab" class:active={$activeTab === 'history'} on:click={() => activeTab.set('history')}>History</button>
    <button class="nav-tab" class:active={$activeTab === 'library'} on:click={() => activeTab.set('library')}>Library</button>
  </nav>

  <main>
    {#if $activeTab === 'draw'}
      <DrawView />
    {:else if $activeTab === 'history'}
      <HistoryView />
    {:else if $activeTab === 'library'}
      <LibraryView />
    {/if}
  </main>
</div>

<ImportModal />
<SplitModal />
<Lightbox />
<ToastContainer />
