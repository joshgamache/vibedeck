<script lang="ts">
  import { decks, currentDeckId, currentCard, drawState, history, cardFlipped, showText, lightboxSrc, STORAGE_KEYS, type Card } from '../js/state';
  import { iGet, iPut, iIdx } from '../js/db';
  import { shuffle, fmtTime } from '../js/utils';
  import { showToast } from '../js/toastStore';
  import { syncRole, roomCode, clientCount, connectedPlayers, sendCardTo, pushCard, pushFlip, pushClear, autoShareMode, globalBroadcastCard } from '../js/sync';

  let animateReveal = false;

  $: {
    if ($syncRole === 'host' && $autoShareMode !== 'global' && $autoShareMode !== 'private' && !$connectedPlayers.some(p => p.peerId === $autoShareMode)) {
      autoShareMode.set('private');
    }
  }

  $: ds = $currentDeckId ? $drawState[$currentDeckId] : null;
  $: deck = $currentDeckId ? $decks.find(d => d.id === $currentDeckId) : null;
  $: progressPercent = deck && ds && deck.cardCount > 0 ? (ds.drawn.length / deck.cardCount * 100) : 0;
  $: hasBoth = $currentCard && $currentCard.front && $currentCard.back;
  $: lastDrawnTime = (() => {
    const deckId = $currentDeckId;
    if (!deckId) return '';
    const h = $history[deckId];
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

  async function loadDeckState(deckId: string) {
    if (!deckId) return;

    let dsVal = await iGet('drawState', deckId);
    if (!dsVal) {
      const cards = await iIdx('cards', 'deckId', deckId);
      dsVal = {
        deckId,
        remaining: shuffle(cards.map((c: any) => c.id)),
        drawn: []
      };
      await iPut('drawState', dsVal);
    }

    drawState.update(store => {
      store[deckId] = dsVal as any;
      return store;
    });

    const hist = await iIdx('history', 'deckId', deckId);
    hist.sort((a: any, b: any) => b.drawnAt - a.drawnAt);
    history.update(store => {
      store[deckId] = hist as any[];
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
    const deckId = $currentDeckId;
    if (!deckId) return;
    const dsVal = $drawState[deckId];
    if (!dsVal || !dsVal.remaining.length) {
      showToast('Deck exhausted — reshuffle to continue', 'error');
      return;
    }
    const cid = dsVal.remaining[0];
    const newRemaining = dsVal.remaining.slice(1);
    const newDrawn = [...dsVal.drawn, cid];

    const updatedDs = {
      deckId: deckId,
      remaining: newRemaining,
      drawn: newDrawn
    };

    await iPut('drawState', updatedDs);

    drawState.update(store => {
      store[deckId] = updatedDs;
      return store;
    });

    const card = await iGet<Card>('cards', cid);
    if (!card) return;
    currentCard.set(card);
    cardFlipped.set(false);
    showText.set(false);

    if ($syncRole === 'host') {
      if ($autoShareMode === 'global') {
        pushCard(card);
      } else if ($autoShareMode !== 'private') {
        sendCardTo($autoShareMode, card);
      }
    }

    const entry = {
      deckId: deckId,
      cardId: cid,
      drawnAt: Date.now()
    };
    await iPut('history', entry);

    history.update(store => {
      const h = store[deckId] || [];
      return {
        ...store,
        [deckId]: [entry, ...h]
      };
    });

    animateReveal = true;
    setTimeout(() => {
      animateReveal = false;
    }, 400);
  }

  async function reshuffleDeck() {
    const deckId = $currentDeckId;
    if (!deckId) return;
    const cards = await iIdx<Card>('cards', 'deckId', deckId);
    const updatedDs = {
      deckId: deckId,
      remaining: shuffle(cards.map(c => c.id)),
      drawn: []
    };

    await iPut('drawState', updatedDs);

    drawState.update(store => {
      store[deckId] = updatedDs;
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
              on:click={(e) => {
                if (!hasBoth) {
                  e.stopPropagation();
                  lightboxSrc.set($currentCard.front);
                }
              }}
            />
          {/if}
        </div>
        <div class="card-face back" id="card-face-back">
          {#if $currentCard && hasBoth}
            <img
              src={$currentCard.back}
              alt=""
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
        id="zoom-btn"
        on:click={() => {
          if ($currentCard) {
            lightboxSrc.set($cardFlipped ? $currentCard.back : $currentCard.front);
          }
        }}
        disabled={!$currentCard}
      >
        🔍 Zoom
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

  {#if $syncRole === 'host'}
    <div class="gm-table-panel">
      <div class="gm-panel-header">
        <h3>GM Table Controls</h3>
        <span class="gm-connection-status">📡 {$clientCount} player{$clientCount === 1 ? '' : 's'} connected (Code: {$roomCode})</span>
      </div>

      <!-- AUTO-SHARE OPTIONS -->
      <div class="gm-panel-section">
        <label for="auto-share-select" class="gm-panel-label">Auto-Share Mode:</label>
        <div class="gm-select-wrapper">
          <select id="auto-share-select" class="gm-select" bind:value={$autoShareMode}>
            <option value="global">📡 Auto-Share to Table (Global)</option>
            <option value="private">🕵️ Keep Private to GM</option>
            {#if $connectedPlayers.length > 0}
              <optgroup label="Auto-Send to Player Hand">
                {#each $connectedPlayers as player (player.peerId)}
                  <option value={player.peerId}>👤 Send to {player.name}'s Hand</option>
                {/each}
              </optgroup>
            {/if}
          </select>
        </div>
      </div>

      <!-- MANUAL ACTIONS FOR CURRENT CARD -->
      {#if $currentCard}
        <div class="gm-panel-section">
          <div class="gm-panel-label">Manual Board Actions:</div>
          <div class="gm-action-buttons">
            <button class="btn btn-primary btn-sm" on:click={() => pushCard($currentCard)}>
              📢 Broadcast to Table
            </button>
            <button class="btn btn-secondary btn-sm btn-clear-table" on:click={pushClear}>
              ❌ Clear Table Screen
            </button>
          </div>
        </div>

        <div class="gm-panel-section">
          <div class="gm-panel-label">Send Privately to Hand:</div>
          {#if $connectedPlayers.length === 0}
            <div class="no-players-hint">No players connected to table</div>
          {:else}
            <div class="distribute-buttons">
              {#each $connectedPlayers as player (player.peerId)}
                <button class="btn btn-secondary btn-distribute" on:click={() => sendCardTo(player.peerId, $currentCard)}>
                  👤 {player.name}
                </button>
              {/each}
              <button class="btn btn-secondary btn-distribute btn-all-hands" on:click={() => {
                $connectedPlayers.forEach(p => sendCardTo(p.peerId, $currentCard));
              }}>
                👥 All Hands
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gm-table-panel {
    width: 100%;
    max-width: 440px;
    margin: 24px auto 0;
    padding: 20px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-top: 2px solid var(--amber);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: left;
  }
  .gm-panel-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .gm-panel-header h3 {
    font-family: "Cinzel", serif;
    font-size: 0.95rem;
    color: var(--amber);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin: 0;
  }
  .gm-connection-status {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .gm-panel-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gm-panel-label {
    font-family: "Cinzel", serif;
    font-size: 0.72rem;
    color: var(--text-dim);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .gm-select-wrapper {
    position: relative;
    width: 100%;
  }
  .gm-select {
    width: 100%;
    background: var(--bg3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: "Crimson Pro", serif;
    font-size: 0.95rem;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .gm-select:focus {
    border-color: var(--amber-dim);
    box-shadow: 0 0 8px rgba(212, 148, 58, 0.1);
  }
  .gm-action-buttons {
    display: flex;
    gap: 10px;
  }
  .gm-action-buttons button {
    flex: 1;
    font-size: 0.75rem;
    padding: 8px 12px;
  }
  .btn-clear-table {
    border-color: var(--red);
    color: var(--red);
  }
  .btn-clear-table:hover {
    background: rgba(196, 80, 64, 0.1);
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
  }
  .btn-distribute {
    font-size: 0.72rem;
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
  .btn-all-hands {
    border-color: var(--blue);
    color: var(--blue);
  }
  .btn-all-hands:hover {
    background: rgba(64, 112, 184, 0.1);
  }
</style>
