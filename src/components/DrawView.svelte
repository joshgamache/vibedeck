<script>
  import { decks, currentDeckId, currentCard, drawState, history, cardFlipped, showText, lightboxSrc, STORAGE_KEYS } from '../js/state.js';
  import { iGet, iPut, iIdx } from '../js/db.js';
  import { shuffle, fmtTime } from '../js/utils.js';
  import { showToast } from '../js/toastStore.js';
  import { syncRole, roomCode, clientCount, connectedPlayers, sendCardTo, pushCard, pushFlip, pushClear } from '../js/sync.js';

  let animateReveal = false;

  $: ds = $currentDeckId ? $drawState[$currentDeckId] : null;
  $: deck = $currentDeckId ? $decks.find(d => d.id === $currentDeckId) : null;
  $: progressPercent = deck && ds && deck.cardCount > 0 ? (ds.drawn.length / deck.cardCount * 100) : 0;
  $: hasBoth = $currentCard && $currentCard.front && $currentCard.back;
  $: lastDrawnTime = (() => {
    const h = $history[$currentDeckId];
    if (h && h.length) {
      return fmtTime(h[0].drawnAt);
    }
    return '';
  })();

  $: {
    if ($currentDeckId) {
      loadDeckState($currentDeckId);
    }
  }

  async function loadDeckState(deckId) {
    if (!deckId) return;

    let dsVal = await iGet('drawState', deckId);
    if (!dsVal) {
      const cards = await iIdx('cards', 'deckId', deckId);
      dsVal = {
        deckId,
        remaining: shuffle(cards.map(c => c.id)),
        drawn: []
      };
      await iPut('drawState', dsVal);
    }

    drawState.update(store => {
      store[deckId] = dsVal;
      return store;
    });

    const hist = await iIdx('history', 'deckId', deckId);
    hist.sort((a, b) => b.drawnAt - a.drawnAt);
    history.update(store => {
      store[deckId] = hist;
      return store;
    });

    localStorage.setItem(STORAGE_KEYS.lastDeckId, deckId);
  }

  function onDeckChange() {
    currentCard.set(null);
    cardFlipped.set(false);
    showText.set(false);
    if ($syncRole === 'host') {
      pushClear();
    }
  }

  async function drawCard() {
    if (!$currentDeckId) return;
    const dsVal = $drawState[$currentDeckId];
    if (!dsVal || !dsVal.remaining.length) {
      showToast('Deck exhausted — reshuffle to continue', 'error');
      return;
    }
    const cid = dsVal.remaining[0];
    const newRemaining = dsVal.remaining.slice(1);
    const newDrawn = [...dsVal.drawn, cid];

    const updatedDs = {
      deckId: $currentDeckId,
      remaining: newRemaining,
      drawn: newDrawn
    };

    await iPut('drawState', updatedDs);

    drawState.update(store => {
      store[$currentDeckId] = updatedDs;
      return store;
    });

    const card = await iGet('cards', cid);
    currentCard.set(card);
    cardFlipped.set(false);
    showText.set(false);

    if ($syncRole === 'host') {
      pushCard(card);
    }

    const entry = {
      deckId: $currentDeckId,
      cardId: cid,
      drawnAt: Date.now()
    };
    await iPut('history', entry);

    history.update(store => {
      const h = store[$currentDeckId] || [];
      return {
        ...store,
        [$currentDeckId]: [entry, ...h]
      };
    });

    animateReveal = true;
    setTimeout(() => {
      animateReveal = false;
    }, 400);
  }

  async function reshuffleDeck() {
    if (!$currentDeckId) return;
    const cards = await iIdx('cards', 'deckId', $currentDeckId);
    const updatedDs = {
      deckId: $currentDeckId,
      remaining: shuffle(cards.map(c => c.id)),
      drawn: []
    };

    await iPut('drawState', updatedDs);

    drawState.update(store => {
      store[$currentDeckId] = updatedDs;
      return store;
    });

    currentCard.set(null);
    cardFlipped.set(false);
    showText.set(false);
    showToast('Deck reshuffled');
    if ($syncRole === 'host') {
      pushClear();
    }
  }

  function handleCardClick() {
    if (!hasBoth) return;
    cardFlipped.update(v => {
      const next = !v;
      if ($syncRole === 'host') {
        pushFlip(next);
      }
      return next;
    });
  }
</script>

<div id="view-draw" class="view active">
  <div class="deck-selector-bar">
    <span class="deck-label">Deck</span>
    <select class="deck-select" bind:value={$currentDeckId} on:change={onDeckChange}>
      {#each $decks as d (d.id)}
        <option value={d.id}>{d.name}</option>
      {:else}
        <option value="">— No decks imported —</option>
      {/each}
    </select>
    <span class="deck-count-badge">{(ds ? ds.remaining.length : 0)} left</span>
  </div>

  {#if $syncRole === 'host'}
    <div style="text-align: center; font-size: 0.78rem; color: var(--green); margin-bottom: 16px; font-family: 'Cinzel', serif; letter-spacing: 0.05em; text-shadow: 0 0 8px rgba(74, 144, 96, 0.3);">
      📡 Broadcasting live to {$clientCount} player{$clientCount === 1 ? '' : 's'} (Code: {$roomCode})
    </div>
  {/if}

  <div class="deck-progress">
    <div class="deck-progress-bar">
      <div class="deck-progress-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="deck-progress-text">
      <span>{(ds ? ds.drawn.length : 0)} drawn</span>
      <span>{(deck ? deck.cardCount : 0)} total</span>
    </div>
  </div>

  <div class="card-stage">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="card-frame"
      class:flippable={hasBoth}
      class:flipped={$cardFlipped}
      class:revealing={animateReveal}
      id="card-frame"
      on:click={handleCardClick}
    >
      <div class="card-inner">
        <div class="card-face front" id="card-face-front">
          {#if !$currentCard}
            <div class="card-empty">
              <div class="card-empty-symbol">✦</div>
              <div class="card-empty-text">No card drawn</div>
            </div>
          {:else}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <img
              src={$currentCard.front}
              alt=""
              on:click|stopPropagation={() => lightboxSrc.set($currentCard.front)}
            />
          {/if}
        </div>
        <div class="card-face back" id="card-face-back">
          {#if $currentCard && hasBoth}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <img
              src={$currentCard.back}
              alt=""
              on:click|stopPropagation={() => lightboxSrc.set($currentCard.back)}
            />
          {/if}
        </div>
      </div>
    </div>

    {#if $currentCard}
      <div class="card-meta">
        <span class="card-num">Page {$currentCard.pageNum}</span>
        {#if lastDrawnTime}
          <span class="card-drawn-time">{lastDrawnTime}</span>
        {/if}
      </div>

      {#if hasBoth}
        <div class="flip-hint">Tap card to flip</div>
      {/if}

      {#if $showText && $currentCard.text}
        <div class="card-text-panel visible">{$currentCard.text}</div>
      {/if}
    {/if}
  </div>

  <div class="draw-controls">
    <div class="draw-controls-row">
      <button
        class="btn btn-primary"
        id="draw-btn"
        on:click={drawCard}
        disabled={!$currentDeckId || !ds || !ds.remaining.length}
      >
        ✦ Draw Card
      </button>
    </div>
    <div class="draw-controls-row">
      <button
        class="btn btn-secondary"
        id="reshuffle-btn"
        on:click={reshuffleDeck}
        disabled={!$currentDeckId}
      >
        ↺ Reshuffle
      </button>
      <button
        class="btn btn-secondary"
        id="text-btn"
        on:click={() => showText.update(v => !v)}
        disabled={!$currentCard}
      >
        ≡ Text
      </button>
    </div>
  </div>

  {#if $syncRole === 'host' && $currentCard}
    <div class="sync-distribute-panel">
      <div class="distribute-title">Assign Card Privately:</div>
      {#if $connectedPlayers.length === 0}
        <div class="no-players-hint">No players connected to table</div>
      {:else}
        <div class="distribute-buttons">
          {#each $connectedPlayers as player (player.peerId)}
            <button class="btn btn-secondary btn-distribute" on:click={() => sendCardTo(player.peerId, $currentCard)}>
              👤 {player.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sync-distribute-panel {
    width: 100%;
    max-width: 420px;
    margin: 20px auto 0;
    padding: 16px;
    background: var(--bg2);
    border: 1px dashed var(--border2);
    border-radius: var(--radius);
    text-align: center;
  }
  .distribute-title {
    font-family: "Cinzel", serif;
    font-size: 0.75rem;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .no-players-hint {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .distribute-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .btn-distribute {
    font-size: 0.7rem;
    padding: 6px 12px;
    background: rgba(212, 148, 58, 0.08);
    border: 1px solid rgba(212, 148, 58, 0.3);
    color: var(--text-dim);
  }
  .btn-distribute:hover {
    background: rgba(212, 148, 58, 0.18);
    border-color: var(--amber);
    color: var(--amber2);
  }
</style>
