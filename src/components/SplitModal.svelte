<script lang="ts">
  import { decks, currentDeckId, drawState, history, splitDeckId, lightboxSrc, currentCard, cardFlipped, showText, type Deck, type Card, type DrawState } from '../js/state';
  import { iIdx, iBulkPut, iPut, iDel, iDelIdx } from '../js/db';
  import { shuffle } from '../js/utils';
  import { showToast } from '../js/toastStore';

  interface SplitRange {
    id: string;
    name: string;
    start: string;
    end: string;
    color: string;
  }

  let splitCards: Card[] = [];
  let splitRanges: SplitRange[] = [];
  let splitAfter = 'keep'; // 'keep' or 'delete'

  const RCOLORS = ['#d4943a', '#7aabee', '#9b7fd4', '#5db87f', '#e07070', '#c4a840', '#6bccc4', '#e09060'];

  $: deck = $decks.find(d => d.id === $splitDeckId);
  $: validated = splitRanges.length > 0 && splitRanges.every(r => r.name.trim() && parseInt(r.start) > 0 && parseInt(r.end) >= parseInt(r.start));

  // Load cards when splitDeckId opens
  $: {
    if ($splitDeckId) {
      loadSplitCards($splitDeckId);
      splitRanges = [];
      splitAfter = 'keep';
    }
  }

  async function loadSplitCards(deckId: string): Promise<void> {
    splitCards = await iIdx<Card>('cards', 'deckId', deckId);
    splitCards.sort((a, b) => a.pageNum - b.pageNum);
  }

  function rangeForPage(pnum: number, ranges: SplitRange[]): SplitRange | null {
    return ranges.find(r => {
      const s = parseInt(r.start) || 0;
      const e = parseInt(r.end) || 0;
      return s > 0 && e >= s && pnum >= s && pnum <= e;
    }) || null;
  }

  function getRangeCardCount(r: SplitRange, cards: Card[]): number {
    const s = parseInt(r.start) || 0;
    const e = parseInt(r.end) || 0;
    return cards.filter(c => s > 0 && e >= s && c.pageNum >= s && c.pageNum <= e).length;
  }

  function addSplitRange(): void {
    const color = RCOLORS[splitRanges.length % RCOLORS.length];
    splitRanges = [...splitRanges, {
      id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5),
      name: '',
      start: '',
      end: '',
      color
    }];
  }

  function delRange(id: string): void {
    splitRanges = splitRanges.filter(r => r.id !== id);
  }

  async function confirmSplit(): Promise<void> {
    const originalDeckId = $splitDeckId;
    if (!originalDeckId) return;
    const newDecks: Deck[] = [];

    for (const r of splitRanges) {
      const s = parseInt(r.start);
      const e = parseInt(r.end);
      const rCards = splitCards.filter(c => c.pageNum >= s && c.pageNum <= e);
      if (!rCards.length) continue;

      const nid = 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const nCards = rCards.map((c, i) => ({
        ...c,
        id: `${nid}_${i}`,
        deckId: nid
      }));

      await iBulkPut<Card>('cards', nCards);

      const ndeck: Deck = {
        id: nid,
        name: r.name,
        cardCount: nCards.length,
        createdAt: Date.now(),
        previewImage: nCards[0]?.front || ''
      };

      await iPut<Deck>('decks', ndeck);

      const dsVal: DrawState = {
        deckId: nid,
        remaining: shuffle(nCards.map(c => c.id)),
        drawn: []
      };

      await iPut<DrawState>('drawState', dsVal);

      // Update global states
      drawState.update(store => {
        store[nid] = dsVal;
        return store;
      });
      decks.update(list => [...list, ndeck]);
      history.update(store => {
        store[nid] = [];
        return store;
      });
      newDecks.push(ndeck);
    }

    if (splitAfter === 'delete') {
      await iDel('decks', originalDeckId);
      await iDelIdx('cards', 'deckId', originalDeckId);
      await iDelIdx('history', 'deckId', originalDeckId);
      await iDel('drawState', originalDeckId);

      decks.update(list => list.filter(d => d.id !== originalDeckId));
      drawState.update(store => {
        const next = { ...store };
        delete next[originalDeckId];
        return next;
      });
      history.update(store => {
        const next = { ...store };
        delete next[originalDeckId];
        return next;
      });

      currentDeckId.update(curr => {
        if (curr === originalDeckId) {
          const nextId = newDecks.length ? newDecks[0].id : null;
          currentCard.set(null);
          cardFlipped.set(false);
          showText.set(false);
          return nextId;
        }
        return curr;
      });
    } else {
      if (newDecks.length) {
        currentDeckId.set(newDecks[0].id);
      }
    }

    splitDeckId.set(null);
    showToast(`Created ${newDecks.length} sub-deck${newDecks.length !== 1 ? 's' : ''}!`, 'success');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" class:open={$splitDeckId !== null} on:click|self={() => splitDeckId.set(null)}>
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" style="font-size:.85rem">
        Split: <span style="color:var(--text-dim);font-weight:400">{deck ? deck.name : ''}</span>
        <button class="modal-close" on:click={() => splitDeckId.set(null)}>✕</button>
      </div>
    </div>

    <div class="modal-body">
      <div class="split-section-label">All Cards <span style="color:var(--text-muted)">({splitCards.length})</span></div>
      <div class="split-card-grid" id="split-card-grid">
        {#each splitCards as card (card.id)}
          {@const r = rangeForPage(card.pageNum, splitRanges)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <div class="split-card-thumb" style:border-color={r ? r.color : ''} on:click={() => lightboxSrc.set(card.front)}>
            <img src={card.front} alt="" loading="lazy" />
            <div class="sc-bar" style:background={r ? r.color : 'transparent'}></div>
            <span class="sc-num">p{card.pageNum}</span>
          </div>
        {:else}
          <div class="empty-state" style="grid-column:1/-1;padding:20px 0">
            <div class="empty-state-icon" style="font-size:1.5rem">⏳</div>
            <div class="empty-state-title">Loading…</div>
          </div>
        {/each}
      </div>

      <div class="split-ranges-section">
        <div class="split-section-label">
          Named Ranges
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:.6rem" on:click={addSplitRange}>
            + Add Range
          </button>
        </div>
        <div id="split-ranges-list">
          {#each splitRanges as r, idx (r.id)}
            {@const cnt = getRangeCardCount(r, splitCards)}
            <div class="range-item">
              <div class="range-header">
                <div class="range-color-dot" style:background={r.color}></div>
                <input
                  class="range-name-input"
                  placeholder="Name this sub-deck (e.g. Illustrations)"
                  bind:value={r.name}
                />
                <button class="range-del-btn" on:click={() => delRange(r.id)}>✕</button>
              </div>
              <div class="range-fields">
                <div class="range-field">
                  <div class="range-field-label">From page</div>
                  <input type="number" class="range-num-input" min="1" placeholder="1" bind:value={r.start} />
                </div>
                <div class="range-sep">–</div>
                <div class="range-field">
                  <div class="range-field-label">To page</div>
                  <input type="number" class="range-num-input" min="1" placeholder={splitCards.length ? String(splitCards.length) : '?'} bind:value={r.end} />
                </div>
              </div>
              <div class="range-card-count">
                {cnt > 0 ? `${cnt} card${cnt !== 1 ? 's' : ''} in this range` : 'Enter a page range above'}
              </div>
            </div>
          {:else}
            <div class="no-ranges">No ranges yet — add a range and assign page numbers.</div>
          {/each}
        </div>
      </div>

      <div class="split-after-section">
        <div class="split-section-label" style="margin-bottom:8px">After creating sub-decks…</div>
        <label class="split-option-row">
          <input type="radio" name="split-after" value="keep" checked={splitAfter === 'keep'} on:change={() => splitAfter = 'keep'} />
          <div>
            <div class="split-opt-title">Keep original deck</div>
            <div class="split-opt-sub">Source deck remains alongside new sub-decks</div>
          </div>
        </label>
        <label class="split-option-row">
          <input type="radio" name="split-after" value="delete" checked={splitAfter === 'delete'} on:change={() => splitAfter = 'delete'} />
          <div>
            <div class="split-opt-title">Delete original deck</div>
            <div class="split-opt-sub">Remove source deck after splitting</div>
          </div>
        </label>
      </div>
    </div>

    <div class="modal-footer">
      <div class="draw-controls-row" style="gap:10px">
        <button class="btn btn-secondary" on:click={() => splitDeckId.set(null)}>Cancel</button>
        <button class="btn btn-primary" id="split-confirm-btn" on:click={confirmSplit} disabled={!validated}>
          Create Sub-decks
        </button>
      </div>
    </div>
  </div>
</div>
