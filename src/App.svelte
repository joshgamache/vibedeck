<script lang="ts">
  import { onMount } from 'svelte';
  import { appState, STORAGE_KEYS, type Deck, type DrawState } from './js/state.svelte';
  import { initDB, iAll } from './js/db';

  import DrawView from './components/DrawView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import LibraryView from './components/LibraryView.svelte';
  import TableView from './components/TableView.svelte';
  import ImportModal from './components/ImportModal.svelte';
  import SplitModal from './components/SplitModal.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import { syncState, joinTable } from './js/sync.svelte';

  onMount(async () => {
    // Configure PDF.js Global Worker
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Initialize Database
    await initDB();

    // Load initial decks
    const loadedDecks = await iAll<Deck>('decks');
    appState.decks = loadedDecks;

    // Load drawState cache
    const dsList = await iAll<DrawState>('drawState');
    dsList.forEach(d => {
      appState.drawState[d.deckId] = d;
    });

    // Set initial deck selection
    const lastId = localStorage.getItem(STORAGE_KEYS.lastDeckId);
    if (lastId && loadedDecks.some(d => d.id === lastId)) {
      appState.currentDeckId = lastId;
    } else if (loadedDecks.length) {
      appState.currentDeckId = loadedDecks[0].id;
    }

    // Check for scan-to-join URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const tableCode = urlParams.get('table');
    if (tableCode && tableCode.length === 6) {
      appState.activeTab = 'table';
      joinTable(tableCode);
    }
  });
</script>

<div id="app">
  <header>
    <div class="logo">The Deck <span>/ MCG Card Reader</span></div>
    <button class="btn btn-ghost" onclick={() => appState.importModalOpen = true}>+ Import</button>
  </header>

  <nav>
    <button class="nav-tab" class:active={appState.activeTab === 'draw'} onclick={() => appState.activeTab = 'draw'}>Draw</button>
    <button class="nav-tab" class:active={appState.activeTab === 'history'} onclick={() => appState.activeTab = 'history'}>History</button>
    <button class="nav-tab" class:active={appState.activeTab === 'library'} onclick={() => appState.activeTab = 'library'}>Library</button>
    <button class="nav-tab" style="position: relative;" class:active={appState.activeTab === 'table'} onclick={() => appState.activeTab = 'table'}>
      Table
      {#if syncState.role === 'host'}
        <span class="tab-status-dot host"></span>
      {:else if syncState.role === 'client' && syncState.connectionState === 'connected'}
        <span class="tab-status-dot client"></span>
      {/if}
    </button>
  </nav>

  <main>
    {#if appState.activeTab === 'draw'}
      <DrawView />
    {:else if appState.activeTab === 'history'}
      <HistoryView />
    {:else if appState.activeTab === 'library'}
      <LibraryView />
    {:else if appState.activeTab === 'table'}
      <TableView />
    {/if}
  </main>
</div>


<ImportModal />
<SplitModal />
<Lightbox />
<ToastContainer />

<style>
  .tab-status-dot {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .tab-status-dot.host {
    background-color: var(--green);
    box-shadow: 0 0 6px var(--green);
  }
  .tab-status-dot.client {
    background-color: var(--green);
    box-shadow: 0 0 6px var(--green);
  }
</style>
