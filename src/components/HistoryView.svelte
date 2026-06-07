<script lang="ts">
  import { currentDeckId, history, decks, lightboxSrc, type HistoryEntry, type Card } from '../js/state';
  import { iGet, iDelIdx } from '../js/db';
  import { showToast } from '../js/toastStore';

  interface HistoryCard extends HistoryEntry {
    front: string;
    pageNum: number;
  }

  let historyCards: HistoryCard[] = [];

  $: activeDeck = $decks.find(d => d.id === $currentDeckId);
  $: currentHistory = ($currentDeckId ? $history[$currentDeckId] : []) || [];

  // Reactively fetch card details for history list
  $: {
    loadHistoryDetails(currentHistory);
  }

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
    const deckId = $currentDeckId;
    if (!deckId || !confirm('Clear draw history for this deck?')) return;
    await iDelIdx('history', 'deckId', deckId);

    history.update(h => {
      const next = { ...h };
      next[deckId] = [];
      return next;
    });
    showToast('History cleared');
  }

  function zoomCard(src: string): void {
    lightboxSrc.set(src);
  }
</script>

<div id="view-history" class="view active">
  <div class="history-header">
    <span class="section-title" id="history-title">
      {activeDeck ? `${activeDeck.name} History` : 'Draw History'}
    </span>
    <button class="btn btn-ghost" on:click={clearHistory}>Clear</button>
  </div>
  <div id="history-content">
    {#if !$currentDeckId}
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
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <div class="history-card-thumb" on:click={() => zoomCard(card.front)}>
            <img src={card.front} alt="" loading="lazy" />
            <span class="thumb-num">p{card.pageNum}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
