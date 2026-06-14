<script lang="ts">
  import { appState, STORAGE_KEYS } from '../js/state.svelte';
  import { iDel, iDelIdx } from '../js/db';
  import { fmtDate } from '../js/utils';
  import { showToast } from '../js/toastStore.svelte';
  import { syncState, pushClear } from '../js/sync.svelte';

  function selectDeck(id: string): void {
    appState.currentDeckId = id;
    appState.currentCard = null;
    appState.cardFlipped = false;
    appState.showText = false;
    localStorage.setItem(STORAGE_KEYS.lastDeckId, id);
    appState.activeTab = 'draw';
    if (syncState.role === 'host') {
      pushClear();
    }
  }

  async function deleteDeck(id: string, name: string): Promise<void> {
    if (!confirm(`Delete "${name}" and all its cards?`)) return;

    await iDel('decks', id);
    await iDelIdx('cards', 'deckId', id);
    await iDelIdx('history', 'deckId', id);
    await iDel('drawState', id);

    // Update decks store
    appState.decks = appState.decks.filter(d => d.id !== id);

    // Clean up drawState and history stores
    delete appState.drawState[id];
    delete appState.history[id];

    // If active deck is deleted, select another one or null
    if (appState.currentDeckId === id) {
      let nextId: string | null = null;
      if (appState.decks.length) {
        nextId = appState.decks[0].id;
      }
      appState.currentDeckId = nextId;
      appState.currentCard = null;
      appState.cardFlipped = false;
      appState.showText = false;
      localStorage.setItem(STORAGE_KEYS.lastDeckId, nextId || '');
      if (syncState.role === 'host') {
        pushClear();
      }
    }

    showToast('Deck deleted');
  }

  function openSplit(id: string): void {
    appState.splitDeckId = id;
  }

  function openImport(): void {
    appState.importModalOpen = true;
  }
</script>

<div id="view-library" class="view active">
  <div class="library-top">
    <span class="section-title">My Decks</span>
    <button class="btn btn-ghost" onclick={openImport}>+ Import PDF</button>
  </div>
  <div id="library-content">
    {#if appState.decks.length === 0}
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No decks imported</div>
        <div class="empty-state-sub">Import a Monte Cook Games card deck PDF to get started.</div>
      </div>
    {:else}
      <div class="deck-list">
        {#each appState.decks as deck (deck.id)}
          <div class="deck-item {deck.id === appState.currentDeckId ? 'current' : ''}">
            <div class="deck-item-preview">
              {#if deck.previewImage}
                <img src={deck.previewImage} alt="" />
              {/if}
            </div>
            <div class="deck-item-info">
              <div class="deck-item-name">{deck.name}</div>
              <div class="deck-item-meta">{deck.cardCount} cards · {fmtDate(deck.createdAt)}</div>
            </div>
            <div class="deck-item-actions">
              <button class="btn btn-ghost" onclick={() => selectDeck(deck.id)}>Use</button>
              <button class="btn btn-blue btn-ghost" onclick={() => openSplit(deck.id)}>⌗ Split</button>
              <button class="btn btn-danger btn-ghost" onclick={() => deleteDeck(deck.id, deck.name)}>✕</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

