<script lang="ts">
  import { decks, currentDeckId, activeTab, importModalOpen, splitDeckId, currentCard, cardFlipped, showText, drawState, history, STORAGE_KEYS } from '../js/state';
  import { iDel, iDelIdx } from '../js/db';
  import { fmtDate } from '../js/utils';
  import { showToast } from '../js/toastStore';
  import { syncRole, pushClear } from '../js/sync';

  function selectDeck(id: string): void {
    currentDeckId.set(id);
    currentCard.set(null);
    cardFlipped.set(false);
    showText.set(false);
    localStorage.setItem(STORAGE_KEYS.lastDeckId, id);
    activeTab.set('draw');
    if ($syncRole === 'host') {
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
    decks.update(list => list.filter(d => d.id !== id));

    // Clean up drawState and history stores
    drawState.update(ds => {
      const next = { ...ds };
      delete next[id];
      return next;
    });
    history.update(h => {
      const next = { ...h };
      delete next[id];
      return next;
    });

    // If active deck is deleted, select another one or null
    currentDeckId.update(curr => {
      if (curr === id) {
        let nextId: string | null = null;
        decks.subscribe(list => {
          if (list.length) nextId = list[0].id;
        })();
        currentCard.set(null);
        cardFlipped.set(false);
        showText.set(false);
        localStorage.setItem(STORAGE_KEYS.lastDeckId, nextId || '');
        if ($syncRole === 'host') {
          pushClear();
        }
        return nextId;
      }
      return curr;
    });

    showToast('Deck deleted');
  }

  function openSplit(id: string): void {
    splitDeckId.set(id);
  }

  function openImport(): void {
    importModalOpen.set(true);
  }
</script>

<div id="view-library" class="view active">
  <div class="library-top">
    <span class="section-title">My Decks</span>
    <button class="btn btn-ghost" on:click={openImport}>+ Import PDF</button>
  </div>
  <div id="library-content">
    {#if $decks.length === 0}
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No decks imported</div>
        <div class="empty-state-sub">Import a Monte Cook Games card deck PDF to get started.</div>
      </div>
    {:else}
      <div class="deck-list">
        {#each $decks as deck (deck.id)}
          <div class="deck-item {deck.id === $currentDeckId ? 'current' : ''}">
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
              <button class="btn btn-ghost" on:click={() => selectDeck(deck.id)}>Use</button>
              <button class="btn btn-blue btn-ghost" on:click={() => openSplit(deck.id)}>⌗ Split</button>
              <button class="btn btn-danger btn-ghost" on:click={() => deleteDeck(deck.id, deck.name)}>✕</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
