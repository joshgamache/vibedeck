<script lang="ts">
  import { appState, STORAGE_KEYS, type Card } from '../js/state.svelte';
  import { iGet, iPut, iIdx } from '../js/db';
  import { shuffle, fmtTime } from '../js/utils';
  import { showToast } from '../js/toastStore.svelte';
  import { syncState, sendCardTo, pushCard, pushFlip, pushClear } from '../js/sync.svelte';

  let animateReveal = $state(false);

  $effect(() => {
    if (syncState.role === 'host' && syncState.autoShareMode !== 'global' && syncState.autoShareMode !== 'private' && !syncState.connectedPlayers.some(p => p.peerId === syncState.autoShareMode)) {
      syncState.autoShareMode = 'private';
    }
  });

  const ds = $derived(appState.currentDeckId ? appState.drawState[appState.currentDeckId] : null);
  const deck = $derived(appState.currentDeckId ? appState.decks.find(d => d.id === appState.currentDeckId) : null);
  const progressPercent = $derived(deck && ds && deck.cardCount > 0 ? (ds.drawn.length / deck.cardCount * 100) : 0);
  const hasBoth = $derived(appState.currentCard && appState.currentCard.front && appState.currentCard.back);
  const lastDrawnTime = $derived((() => {
    const deckId = appState.currentDeckId;
    if (!deckId) return '';
    const h = appState.history[deckId];
    if (h && h.length) {
      return fmtTime(h[0].drawnAt);
    }
    return '';
  })());

  $effect(() => {
    if (appState.currentDeckId) {
      loadDeckState(appState.currentDeckId);
    }
  });

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

    appState.drawState[deckId] = dsVal as any;

    const hist = await iIdx('history', 'deckId', deckId);
    hist.sort((a: any, b: any) => b.drawnAt - a.drawnAt);
    appState.history[deckId] = hist as any[];

    localStorage.setItem(STORAGE_KEYS.lastDeckId, deckId);
  }

  function onDeckChange() {
    appState.currentCard = null;
    appState.cardFlipped = false;
    appState.showText = false;
    if (syncState.role === 'host') {
      pushClear();
    }
  }

  async function drawCard() {
    const deckId = appState.currentDeckId;
    if (!deckId) return;
    const dsVal = appState.drawState[deckId];
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
    appState.drawState[deckId] = updatedDs;

    const card = await iGet<Card>('cards', cid);
    if (!card) return;
    appState.currentCard = card;
    appState.cardFlipped = false;
    appState.showText = false;

    if (syncState.role === 'host') {
      if (syncState.autoShareMode === 'global') {
        pushCard(card);
      } else if (syncState.autoShareMode !== 'private') {
        sendCardTo(syncState.autoShareMode, card);
      }
    }

    const entry = {
      deckId: deckId,
      cardId: cid,
      drawnAt: Date.now()
    };
    await iPut('history', entry);

    const h = appState.history[deckId] || [];
    appState.history[deckId] = [entry, ...h];

    animateReveal = true;
    setTimeout(() => {
      animateReveal = false;
    }, 400);
  }

  async function reshuffleDeck() {
    const deckId = appState.currentDeckId;
    if (!deckId) return;
    const cards = await iIdx<Card>('cards', 'deckId', deckId);
    const updatedDs = {
      deckId: deckId,
      remaining: shuffle(cards.map(c => c.id)),
      drawn: []
    };

    await iPut('drawState', updatedDs);
    appState.drawState[deckId] = updatedDs;

    appState.currentCard = null;
    appState.cardFlipped = false;
    appState.showText = false;
    showToast('Deck reshuffled');
    if (syncState.role === 'host') {
      pushClear();
    }
  }

  function handleCardClick() {
    if (!hasBoth) return;
    appState.cardFlipped = !appState.cardFlipped;
    if (syncState.role === 'host') {
      pushFlip(appState.cardFlipped);
    }
  }
</script>

<div id="view-draw" class="view active">
  <div class="deck-selector-bar">
    <span class="deck-label">Deck</span>
    <select class="deck-select" bind:value={appState.currentDeckId} onchange={onDeckChange}>
      {#each appState.decks as d (d.id)}
        <option value={d.id}>{d.name}</option>
      {:else}
        <option value="">— No decks imported —</option>
      {/each}
    </select>
    <span class="deck-count-badge">{(ds ? ds.remaining.length : 0)} left</span>
  </div>

  {#if syncState.role === 'host'}
    <div style="text-align: center; font-size: 0.78rem; color: var(--green); margin-bottom: 16px; font-family: 'Cinzel', serif; letter-spacing: 0.05em; text-shadow: 0 0 8px rgba(74, 144, 96, 0.3);">
      📡 Broadcasting live to {syncState.clientCount} player{syncState.clientCount === 1 ? '' : 's'} (Code: {syncState.roomCode})
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
      class:flipped={appState.cardFlipped}
      class:revealing={animateReveal}
      id="card-frame"
      onclick={handleCardClick}
    >
      <div class="card-inner">
        <div class="card-face front" id="card-face-front">
          {#if !appState.currentCard}
            <div class="card-empty">
              <div class="card-empty-symbol">✦</div>
              <div class="card-empty-text">No card drawn</div>
            </div>
          {:else}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <img
              src={appState.currentCard.front}
              alt=""
              onclick={(e) => {
                if (!hasBoth) {
                  e.stopPropagation();
                  appState.lightboxSrc = appState.currentCard!.front;
                }
              }}
            />
          {/if}
        </div>
        <div class="card-face back" id="card-face-back">
          {#if appState.currentCard && hasBoth}
            <img
              src={appState.currentCard.back}
              alt=""
            />
          {/if}
        </div>
      </div>
    </div>

    {#if appState.currentCard}
      <div class="card-meta">
        <span class="card-num">Page {appState.currentCard.pageNum}</span>
        {#if lastDrawnTime}
          <span class="card-drawn-time">{lastDrawnTime}</span>
        {/if}
      </div>

      {#if hasBoth}
        <div class="flip-hint">Tap card to flip</div>
      {/if}

      {#if appState.showText && appState.currentCard.text}
        <div class="card-text-panel visible">{appState.currentCard.text}</div>
      {/if}
    {/if}
  </div>

  <div class="draw-controls">
    <div class="draw-controls-row">
      <button
        class="btn btn-primary"
        id="draw-btn"
        onclick={drawCard}
        disabled={!appState.currentDeckId || !ds || !ds.remaining.length}
      >
        ✦ Draw Card
      </button>
    </div>
    <div class="draw-controls-row">
      <button
        class="btn btn-secondary"
        id="reshuffle-btn"
        onclick={reshuffleDeck}
        disabled={!appState.currentDeckId}
      >
        ↺ Reshuffle
      </button>
      <button
        class="btn btn-secondary"
        id="zoom-btn"
        onclick={() => {
          if (appState.currentCard) {
            appState.lightboxSrc = appState.cardFlipped ? appState.currentCard.back : appState.currentCard.front;
          }
        }}
        disabled={!appState.currentCard}
      >
        🔍 Zoom
      </button>
      <button
        class="btn btn-secondary"
        id="text-btn"
        onclick={() => appState.showText = !appState.showText}
        disabled={!appState.currentCard}
      >
        ≡ Text
      </button>
    </div>
  </div>

  {#if syncState.role === 'host'}
    <div class="gm-table-panel">
      <div class="gm-panel-header">
        <h3>GM Table Controls</h3>
        <span class="gm-connection-status">📡 {syncState.clientCount} player{syncState.clientCount === 1 ? '' : 's'} connected (Code: {syncState.roomCode})</span>
      </div>

      <!-- AUTO-SHARE OPTIONS -->
      <div class="gm-panel-section">
        <label for="auto-share-select" class="gm-panel-label">Auto-Share Mode:</label>
        <div class="gm-select-wrapper">
          <select id="auto-share-select" class="gm-select" bind:value={syncState.autoShareMode}>
            <option value="global">📡 Auto-Share to Table (Global)</option>
            <option value="private">🕵️ Keep Private to GM</option>
            {#if syncState.connectedPlayers.length > 0}
              <optgroup label="Auto-Send to Player Hand">
                {#each syncState.connectedPlayers as player (player.peerId)}
                  <option value={player.peerId}>👤 Send to {player.name}'s Hand</option>
                {/each}
              </optgroup>
            {/if}
          </select>
        </div>
      </div>

      <!-- MANUAL ACTIONS FOR CURRENT CARD -->
      {#if appState.currentCard}
        <div class="gm-panel-section">
          <div class="gm-panel-label">Manual Board Actions:</div>
          <div class="gm-action-buttons">
            <button class="btn btn-primary btn-sm" onclick={() => pushCard(appState.currentCard)}>
              📢 Broadcast to Table
            </button>
            <button class="btn btn-secondary btn-sm btn-clear-table" onclick={pushClear}>
              ❌ Clear Table Screen
            </button>
          </div>
        </div>

        <div class="gm-panel-section">
          <div class="gm-panel-label">Send Privately to Hand:</div>
          {#if syncState.connectedPlayers.length === 0}
            <div class="no-players-hint">No players connected to table</div>
          {:else}
            <div class="distribute-buttons">
              {#each syncState.connectedPlayers as player (player.peerId)}
                <button class="btn btn-secondary btn-distribute" onclick={() => sendCardTo(player.peerId, appState.currentCard)}>
                  👤 {player.name}
                </button>
              {/each}
              <button class="btn btn-secondary btn-distribute btn-all-hands" onclick={() => {
                syncState.connectedPlayers.forEach(p => sendCardTo(p.peerId, appState.currentCard));
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
