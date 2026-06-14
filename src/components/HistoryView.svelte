<script lang="ts">
  import { appState, type HistoryEntry, type Card } from '../js/state.svelte';
  import { iGet, iDelIdx } from '../js/db';
  import { showToast } from '../js/toastStore.svelte';

  interface HistoryCard extends HistoryEntry {
    front: string;
    pageNum: number;
  }

  let historyCards = $state<HistoryCard[]>([]);

  const activeDeck = $derived(appState.decks.find(d => d.id === appState.currentDeckId));
  const currentHistory = $derived((appState.currentDeckId ? appState.history[appState.currentDeckId] : []) || []);

  // Reactively fetch card details for history list
  $effect(() => {
    loadHistoryDetails(currentHistory);
  });

  async function loadHistoryDetails(hist: HistoryEntry[]): Promise<void> {
    if (!hist || !hist.length) {
      historyCards = [];
      return;
    }
    const cards: HistoryCard[] = [];
    for (const entry of hist) {
      const card = await iGet<Card>('cards', entry.cardId);
      if (card) {
        cards.push({
          ...entry,
          front: card.front,
          pageNum: card.pageNum
        });
      }
    }
    historyCards = cards;
  }

  async function clearHistory(): Promise<void> {
    const deckId = appState.currentDeckId;
    if (!deckId || !confirm('Clear draw history for this deck?')) return;
    await iDelIdx('history', 'deckId', deckId);

    appState.history[deckId] = [];
    showToast('History cleared');
  }

  function zoomCard(src: string): void {
    appState.lightboxSrc = src;
  }
</script>

<div id="view-history" class="view active">
  <div class="history-header">
    <span class="section-title" id="history-title">
      {activeDeck ? `${activeDeck.name} History` : 'Draw History'}
    </span>
    <button class="btn btn-ghost" onclick={clearHistory}>Clear</button>
  </div>
  <div id="history-content">
    {#if !appState.currentDeckId}
      <div class="empty-state">
        <div class="empty-state-icon">🃏</div>
        <div class="empty-state-title">No deck selected</div>
      </div>
    {:else if historyCards.length === 0}
      <div class="empty-state">
        <div class="empty-state-icon">🃏</div>
        <div class="empty-state-title">No cards drawn yet</div>
        <div class="empty-state-sub">Cards you draw will appear here.</div>
      </div>
    {:else}
      <div class="history-grid">
        {#each historyCards as card (card.cardId + card.drawnAt)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div class="history-card-thumb" onclick={() => zoomCard(card.front)}>
            <img src={card.front} alt="" loading="lazy" />
            <span class="thumb-num">p{card.pageNum}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

