<script lang="ts">
  import { syncState, disconnect, joinTable, discardCardToPile, passCardTo, pushCard } from "../js/sync.svelte";
  import { appState } from "../js/state.svelte";

  // Bindable properties
  let { showDiscardPile = $bindable(), showPassMenu = $bindable() } = $props();

  let showNotesEditor = $state(false);
  let newNoteText = $state("");

  const hasBoth = $derived(syncState.sharedCard && syncState.sharedCard.front && syncState.sharedCard.back);
  const isEditable = $derived(syncState.role === "host" || (syncState.sharedCard && syncState.receivedCards.some(c => c.id === syncState.sharedCard!.id)));

  function handleJoin() {
    if (syncState.roomCode.trim().length === 6 && syncState.playerName.trim()) {
      joinTable(syncState.roomCode.trim(), syncState.playerName.trim());
    }
  }

  function handleCardClick() {
    if (!hasBoth) return;
    syncState.sharedCardFlipped = !syncState.sharedCardFlipped;
  }

  function returnToGlobal() {
    syncState.sharedCard = syncState.globalBroadcastCard;
    syncState.sharedCardFlipped = syncState.globalBroadcastCardFlipped;
    syncState.sharedCardShowText = false;
  }

  function clearHand() {
    if (confirm("Discard all cards in your hand?")) {
      const tempHand = [...syncState.receivedCards];
      tempHand.forEach((card) => {
        discardCardToPile(card);
      });
    }
  }

  function addAnnotation() {
    if (!newNoteText.trim() || !syncState.sharedCard) return;
    const updatedAnnotations = [...(syncState.sharedCard.annotations || []), newNoteText.trim()];
    
    syncState.sharedCard.annotations = updatedAnnotations;

    if (syncState.role === 'host') {
      syncState.globalBroadcastCard = syncState.sharedCard;
      pushCard(syncState.sharedCard);
    } else {
      syncState.receivedCards = syncState.receivedCards.map(c => {
        if (c.id === syncState.sharedCard!.id) {
          return { ...c, annotations: updatedAnnotations };
        }
        return c;
      });
    }

    newNoteText = "";
  }

  function removeAnnotation(index: number) {
    if (!syncState.sharedCard) return;
    const updatedAnnotations = (syncState.sharedCard.annotations || []).filter((_, i) => i !== index);
    
    syncState.sharedCard.annotations = updatedAnnotations;

    if (syncState.role === 'host') {
      syncState.globalBroadcastCard = syncState.sharedCard;
      pushCard(syncState.sharedCard);
    } else {
      syncState.receivedCards = syncState.receivedCards.map(c => {
        if (c.id === syncState.sharedCard!.id) {
          return { ...c, annotations: updatedAnnotations };
        }
        return c;
      });
    }
  }
</script>

<div class="sync-active-container">
  <div class="status-header">
    <span class="status-indicator" class:connected={syncState.connectionState === "connected"} class:connecting={syncState.connectionState === "connecting"}>
      {#if syncState.connectionState === "connected"}
        ● CONNECTED AS {syncState.playerName.toUpperCase()} (TABLE: {syncState.roomCode})
      {:else if syncState.connectionState === "connecting"}
        ● CONNECTING
      {:else}
        ● DISCONNECTED
      {/if}
    </span>
    <div style="display: flex; gap: 8px; align-items: center;">
      {#if syncState.connectionState === "connected"}
        <button class="btn btn-secondary btn-ghost btn-sm" style="font-size: 0.65rem;" onclick={() => showDiscardPile = true}>
          🗂️ Discard Pile ({syncState.discardPile.length})
        </button>
      {/if}
      <button class="btn btn-secondary btn-ghost" onclick={disconnect}>Disconnect</button>
    </div>
  </div>

  {#if syncState.connectionState === "connecting"}
    <div class="client-waiting">
      <div class="pulse-icon">⚡</div>
      <h2>Connecting to host...</h2>
      <p>Please wait while we establish a secure peer-to-peer connection.</p>
    </div>
  {:else if syncState.connectionState === "error"}
    <div class="client-error">
      <div class="error-icon">⚠️</div>
      <h2>Connection Error</h2>
      <p class="error-msg">{syncState.syncError || "Could not connect to room."}</p>
      <button class="btn btn-primary" onclick={() => joinTable(syncState.roomCode, syncState.playerName)}>Retry</button>
    </div>
  {:else}
    <!-- Connected client view -->
    {#if !syncState.sharedCard}
      <div class="client-waiting">
        <div class="pulse-icon">✦</div>
        <h2>Waiting for GM...</h2>
        <p>Once the GM draws, broadcasts, or assigns you a card, it will appear here instantly.</p>
      </div>
    {:else}
      <div class="card-stage">
        {#if syncState.sharedCard}
          {#if syncState.globalBroadcastCard && syncState.sharedCard.id !== syncState.globalBroadcastCard.id}
            <div class="private-card-banner">
              <span>🕵️ Viewing Private Hand Card</span>
              <button class="btn btn-ghost btn-sm btn-return-table" onclick={returnToGlobal}>
                Return to Shared Card
              </button>
            </div>
          {:else}
            <!-- Show simple notification that it's a private card if table is clear -->
            {#if !syncState.globalBroadcastCard && syncState.receivedCards.some(c => c.id === syncState.sharedCard.id)}
              <div class="private-card-banner">
                <span>🕵️ Viewing Private Hand Card</span>
              </div>
            {/if}
          {/if}
        {/if}

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="card-frame"
          class:flippable={hasBoth}
          class:flipped={syncState.sharedCardFlipped}
          id="shared-card-frame"
          onclick={handleCardClick}
        >
          <div class="card-inner">
            <div class="card-face front">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <img
                src={syncState.sharedCard.front}
                alt=""
                onclick={(e) => {
                  if (!hasBoth) {
                    e.stopPropagation();
                    appState.lightboxSrc = syncState.sharedCard!.front;
                  }
                }}
              />
            </div>
            <div class="card-face back">
              {#if hasBoth}
                <img
                  src={syncState.sharedCard.back}
                  alt=""
                />
              {/if}
            </div>
          </div>
        </div>

        {#if syncState.sharedCard.annotations && syncState.sharedCard.annotations.length > 0}
          <div class="card-annotations-display">
            {#each syncState.sharedCard.annotations as note}
              <span class="card-annotation-badge">📌 {note}</span>
            {/each}
          </div>
        {/if}

        <div class="card-meta">
          <span class="card-num">Page {syncState.sharedCard.pageNum}</span>
          <div style="display: flex; gap: 8px;">
            <button 
              class="btn btn-ghost btn-text-toggle" 
              disabled={!syncState.sharedCard}
              onclick={() => appState.lightboxSrc = syncState.sharedCardFlipped ? syncState.sharedCard!.back : syncState.sharedCard!.front}
            >
              🔍 Zoom
            </button>
            <button 
              class="btn btn-ghost btn-text-toggle" 
              disabled={!syncState.sharedCard.text}
              onclick={() => syncState.sharedCardShowText = !syncState.sharedCardShowText}
            >
              ≡ Text
            </button>
            <button 
              class="btn btn-ghost btn-text-toggle"
              class:active={showNotesEditor}
              disabled={!syncState.sharedCard}
              onclick={() => showNotesEditor = !showNotesEditor}
            >
              ✏️ Notes
            </button>
            {#if syncState.receivedCards.some(c => c.id === syncState.sharedCard!.id)}
              <button 
                class="btn btn-ghost btn-text-toggle"
                class:active={showPassMenu}
                onclick={() => showPassMenu = !showPassMenu}
              >
                🤝 Pass
              </button>
              <button 
                class="btn btn-ghost btn-text-toggle btn-discard-card"
                onclick={() => discardCardToPile(syncState.sharedCard)}
              >
                🗑️ Discard
              </button>
            {/if}
          </div>
        </div>

        {#if hasBoth}
          <div class="flip-hint">Tap card to flip</div>
        {/if}

        {#if syncState.sharedCardShowText && syncState.sharedCard.text}
          <div class="card-text-panel visible">{syncState.sharedCard.text}</div>
        {/if}

        {#if showNotesEditor}
          <div class="notes-editor-panel">
            <div class="notes-header">
              <h5>Card Annotations</h5>
              <button class="btn-close-notes" onclick={() => showNotesEditor = false}>×</button>
            </div>
            
            <div class="notes-list">
              {#each (syncState.sharedCard.annotations || []) as note, i}
                <div class="note-item">
                  <span>📌 {note}</span>
                  {#if isEditable}
                    <button class="btn-delete-note" onclick={() => removeAnnotation(i)}>×</button>
                  {/if}
                </div>
              {:else}
                <p class="no-notes-hint">No custom notes attached to this card.</p>
              {/each}
            </div>

            {#if isEditable}
              <div class="add-note-group">
                <input 
                  type="text" 
                  placeholder="Type note (e.g., Charges: 3)" 
                  bind:value={newNoteText}
                  onkeydown={(e) => e.key === "Enter" && addAnnotation()}
                />
                <button class="btn btn-primary btn-sm" onclick={addAnnotation} disabled={!newNoteText.trim()}>
                  Add
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Personal Player Hand Collection -->
    {#if syncState.receivedCards.length > 0}
      <div class="player-hand-section">
        <div class="hand-header">
          <h4>My Cards ({syncState.receivedCards.length})</h4>
          <button class="btn btn-ghost btn-clear-hand" onclick={clearHand}>Discard Hand</button>
        </div>
        <div class="hand-scroll">
          {#each syncState.receivedCards as card (card.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
              class="hand-card-thumb" 
              class:active={syncState.sharedCard && syncState.sharedCard.id === card.id} 
              onclick={() => {
                syncState.sharedCard = card;
                syncState.sharedCardFlipped = false;
                syncState.sharedCardShowText = false;
              }}
            >
              <img src={card.front} alt="" />
              <span class="hand-card-num">p{card.pageNum}</span>
              <button 
                class="btn-thumb-discard" 
                title="Discard Card"
                onclick={(e) => { e.stopPropagation(); discardCardToPile(card); }}
              >
                ×
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .sync-active-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 16px;
  }
  .status-indicator {
    font-family: "Cinzel", serif;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status-indicator.connected {
    color: var(--green);
    text-shadow: 0 0 8px rgba(74, 144, 96, 0.4);
  }
  .status-indicator.connecting {
    color: var(--amber);
    animation: textPulse 1.5s infinite;
  }
  @keyframes textPulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  .client-waiting {
    padding: 60px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 100%;
  }
  .pulse-icon {
    font-size: 3rem;
    color: var(--amber-dim);
    animation: iconPulse 2s infinite ease-in-out;
  }
  @keyframes iconPulse {
    0%, 100% { transform: scale(1); opacity: 0.3; }
    50% { transform: scale(1.1); opacity: 0.8; text-shadow: 0 0 15px var(--amber); }
  }
  .client-waiting h2 {
    font-family: "Cinzel", serif;
    font-size: 1rem;
    letter-spacing: 0.08em;
    color: var(--text);
    text-transform: uppercase;
  }
  .client-waiting p {
    color: var(--text-muted);
    font-size: 0.95rem;
    font-style: italic;
    max-width: 300px;
    line-height: 1.5;
  }

  .client-error {
    padding: 40px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    background: var(--bg2);
    border: 1px solid rgba(196, 80, 64, 0.3);
    border-radius: var(--radius);
    width: 100%;
  }
  .error-icon {
    font-size: 3rem;
    color: var(--red);
  }
  .client-error h2 {
    font-family: "Cinzel", serif;
    font-size: 1rem;
    color: var(--red);
    text-transform: uppercase;
  }
  .error-msg {
    color: var(--text-dim);
    font-size: 0.95rem;
    max-width: 340px;
    line-height: 1.5;
  }

  .private-card-banner {
    background: rgba(212, 148, 58, 0.12);
    border: 1px solid var(--amber-dim);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: "Cinzel", serif;
    font-size: 0.72rem;
    color: var(--amber2);
    margin-bottom: 12px;
  }
  .btn-return-table {
    font-size: 0.65rem;
    padding: 4px 8px;
    border-color: var(--amber-dim);
    color: var(--amber);
  }
  .btn-return-table:hover {
    background: rgba(212, 148, 58, 0.15);
    color: var(--amber2);
  }

  .card-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .card-frame {
    width: 100%;
    max-width: 260px;
    aspect-ratio: 2.5/3.5;
    perspective: 1000px;
    cursor: pointer;
    margin-bottom: 16px;
  }
  .card-inner {
    width: 100%;
    height: 100%;
    transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
    transform-style: preserve-3d;
    position: relative;
  }
  .card-frame.flipped .card-inner {
    transform: rotateY(180deg);
  }
  .card-face {
    position: absolute;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg2);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card-face.back {
    transform: rotateY(180deg);
  }
  .card-face img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .flip-hint {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 8px;
  }

  .card-annotations-display {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
    justify-content: center;
    width: 100%;
  }
  .card-annotation-badge {
    font-size: 0.72rem;
    color: var(--amber2);
    background: rgba(212, 148, 58, 0.08);
    border: 1px solid rgba(212, 148, 58, 0.25);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: "Crimson Pro", serif;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 12px;
  }
  .card-num {
    font-family: "Cinzel", serif;
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .btn-text-toggle {
    font-size: 0.72rem;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .btn-text-toggle.active {
    background: var(--border2);
    color: var(--amber2);
  }
  .btn-discard-card {
    border-color: var(--red);
    color: var(--red);
  }
  .btn-discard-card:hover {
    background: rgba(196, 80, 64, 0.1);
  }

  .card-text-panel {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    color: var(--text-dim);
    font-size: 0.95rem;
    line-height: 1.5;
    text-align: left;
    margin-bottom: 16px;
    width: 100%;
  }

  .notes-editor-panel {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }
  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
  }
  .notes-header h5 {
    font-family: "Cinzel", serif;
    font-size: 0.78rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
  }
  .btn-close-notes {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    line-height: 1;
  }
  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 150px;
    overflow-y: auto;
  }
  .note-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg2);
    border: 1px solid var(--border);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.88rem;
  }
  .btn-delete-note {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
  }
  .btn-delete-note:hover {
    color: var(--red);
  }
  .no-notes-hint {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-style: italic;
    margin: 0;
  }
  .add-note-group {
    display: flex;
    gap: 8px;
  }
  .add-note-group input {
    flex-grow: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 6px 10px;
    font-size: 0.85rem;
    outline: none;
  }
  .add-note-group input:focus {
    border-color: var(--amber-dim);
  }

  .player-hand-section {
    width: 100%;
    max-width: 420px;
    margin: 24px auto 0;
    border-top: 1px solid var(--border);
    padding-top: 16px;
  }
  .hand-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .hand-header h4 {
    font-family: "Cinzel", serif;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    text-transform: uppercase;
  }
  .btn-clear-hand {
    font-size: 0.65rem;
    padding: 4px 8px;
  }
  .hand-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 10px;
    scrollbar-width: thin;
  }
  .hand-scroll::-webkit-scrollbar {
    height: 4px;
  }
  .hand-scroll::-webkit-scrollbar-thumb {
    background: var(--border2);
    border-radius: 4px;
  }
  .hand-card-thumb {
    width: 68px;
    aspect-ratio: 2.5/3.5;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
  }
  .hand-card-thumb:hover {
    border-color: var(--amber-dim);
    transform: translateY(-2px);
  }
  .hand-card-thumb.active {
    border-color: var(--amber);
    box-shadow: 0 0 10px rgba(212, 148, 58, 0.3);
  }
  .hand-card-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .hand-card-num {
    position: absolute;
    bottom: 2px;
    right: 3px;
    font-family: "Cinzel", serif;
    font-size: 0.55rem;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.75);
    padding: 1px 3px;
    border-radius: 3px;
  }
  .btn-thumb-discard {
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(196, 80, 64, 0.8);
    border: none;
    color: #fff;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    font-size: 0.65rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .btn-thumb-discard:hover {
    background: rgba(196, 80, 64, 1);
  }
</style>
