<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import QRCode from "qrcode";
  import {
    syncRole,
    roomCode,
    syncState,
    clientCount,
    sharedCard,
    sharedCardFlipped,
    sharedCardShowText,
    syncError,
    playerName,
    connectedPlayers,
    receivedCards,
    startHosting,
    joinTable,
    disconnect,
    sendCardTo,
    globalBroadcastCard,
    globalBroadcastCardFlipped,
    discardPile,
    discardCardToPile,
    discardTableCard,
    requestRecall,
    passCardTo,
    pushCard,
    virtualPlayerHands,
    addVirtualPlayer,
    removeVirtualPlayer,
    discardVirtualCard,
  } from "../js/sync";
  import { currentCard, lightboxSrc } from "../js/state";

  let inputCode = "";
  let qrCanvas: HTMLCanvasElement;
  let showPassMenu = false;
  let showNotesEditor = false;
  let showDiscardPile = false;
  let newNoteText = "";

  let newVirtualName = "";
  let inspectingPlayerId: string | null = null;
  let virtualCardFlips: Record<string, boolean> = {}; // Dictionary of cardId -> boolean

  function handleAddVirtual() {
    if (newVirtualName.trim()) {
      addVirtualPlayer(newVirtualName.trim());
      newVirtualName = "";
    }
  }

  $: isEditable = $syncRole === "host" || ($sharedCard && $receivedCards.some(c => c.id === $sharedCard.id));

  $: hasBoth = $sharedCard && $sharedCard.front && $sharedCard.back;

  // Re-run whenever qrCanvas or roomCode changes in hosting mode
  $: {
    if (qrCanvas && $roomCode && $syncRole === "host") {
      setTimeout(renderQRCode, 50);
    }
  }

  async function renderQRCode() {
    if (!qrCanvas) return;
    const joinUrl = `${window.location.origin}${window.location.pathname}?table=${$roomCode}`;
    try {
      await QRCode.toCanvas(qrCanvas, joinUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: "#080810",
          light: "#e8e4d8",
        },
      });
    } catch (e) {
      console.error("Failed to generate QR code", e);
    }
  }

  function handleJoin() {
    if (inputCode.trim().length === 6 && $playerName.trim()) {
      joinTable(inputCode.trim(), $playerName.trim());
    }
  }

  function handleCardClick() {
    if (!hasBoth) return;
    sharedCardFlipped.update((v) => !v);
  }

  function returnToGlobal() {
    sharedCard.set($globalBroadcastCard);
    sharedCardFlipped.set($globalBroadcastCardFlipped);
    sharedCardShowText.set(false);
  }

  function clearHand() {
    if (confirm("Discard all cards in your hand?")) {
      const tempHand = [...$receivedCards];
      tempHand.forEach((card) => {
        discardCardToPile(card);
      });
    }
  }

  function addAnnotation() {
    if (!newNoteText.trim() || !$sharedCard) return;
    const updatedAnnotations = [...($sharedCard.annotations || []), newNoteText.trim()];
    
    sharedCard.update(card => {
      if (card) {
        card.annotations = updatedAnnotations;
      }
      return card;
    });

    if ($syncRole === 'host') {
      globalBroadcastCard.set($sharedCard);
      pushCard($sharedCard);
    } else {
      receivedCards.update(list => list.map(c => {
        if (c.id === $sharedCard.id) {
          return { ...c, annotations: updatedAnnotations };
        }
        return c;
      }));
    }

    newNoteText = "";
  }

  function removeAnnotation(index: number) {
    if (!$sharedCard) return;
    const updatedAnnotations = ($sharedCard.annotations || []).filter((_, i) => i !== index);
    
    sharedCard.update(card => {
      if (card) {
        card.annotations = updatedAnnotations;
      }
      return card;
    });

    if ($syncRole === 'host') {
      globalBroadcastCard.set($sharedCard);
      pushCard($sharedCard);
    } else {
      receivedCards.update(list => list.map(c => {
        if (c.id === $sharedCard.id) {
          return { ...c, annotations: updatedAnnotations };
        }
        return c;
      }));
    }
  }

  onMount(() => {
    if ($roomCode && $syncRole === "client") {
      inputCode = $roomCode;
    }
  });
</script>

<div id="view-table" class="view active">
  {#if $syncRole === "none"}
    <div class="sync-choice-container">
      <h2 class="sync-title">Table Sync</h2>
      <p class="sync-subtitle">Share card draws across devices at your table in real time.</p>

      <div class="choice-cards">
        <!-- HOST CARD -->
        <div class="choice-card host-card">
          <div class="choice-icon">📢</div>
          <h3>Host Table (GM)</h3>
          <p>Create a game room. Broadcast drawn cards to everyone, or distribute them privately to specific players.</p>
          <button class="btn btn-primary" on:click={startHosting}>Host Room</button>
        </div>

        <!-- JOIN CARD -->
        <div class="choice-card join-card">
          <div class="choice-icon">🔌</div>
          <h3>Join Table (Player)</h3>
          <p>Set your name and enter a 6-digit room code to join a GM's table.</p>
          
          <div class="join-input-group">
            <input 
              type="text" 
              placeholder="Your Name" 
              bind:value={$playerName} 
              style="letter-spacing: normal; font-family: 'Crimson Pro', serif; font-size: 1.05rem; margin-bottom: 4px;"
            />
            <input 
              type="text" 
              placeholder="6-digit Room Code" 
              maxlength="6" 
              bind:value={inputCode} 
              on:keydown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button class="btn btn-secondary" on:click={handleJoin} disabled={inputCode.length !== 6 || !$playerName.trim()}>
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>

  {:else if $syncRole === "host"}
    <div class="sync-active-container">
      <div class="status-header">
        <span class="status-indicator connected">● HOSTING</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary btn-ghost btn-sm" style="font-size: 0.65rem;" on:click={() => showDiscardPile = true}>
            🗂️ Discard Pile ({$discardPile.length})
          </button>
          <button class="btn btn-danger btn-ghost" on:click={disconnect}>Stop Hosting</button>
        </div>
      </div>

      <div class="host-info-panel">
        <div class="info-details">
          <h2>Room Code</h2>
          <div class="room-code-display">{$roomCode}</div>
          <p class="connection-status">
            {#if $syncState === "connecting"}
              Creating table...
            {:else if $syncState === "connected"}
              Waiting for players... <strong>{$clientCount}</strong> connected
            {:else if $syncState === "error"}
              <span class="error-text">{$syncError || "Failed to connect"}</span>
            {/if}
          </p>
        </div>
        
        <div class="qr-code-wrapper">
          <div class="qr-code-label">Scan to Join</div>
          <div class="qr-code-box">
            {#if !$roomCode}
              <div class="qr-placeholder">Generating...</div>
            {/if}
            <canvas bind:this={qrCanvas} style="display: {$roomCode ? 'block' : 'none'}; width: 160px; height: 160px;"></canvas>
          </div>
        </div>
      </div>

      <div class="seats-manager-panel">
        <div class="seats-header-row">
          <h3>Table Seats ({$connectedPlayers.length})</h3>
          <div class="add-virtual-form">
            <input
              type="text"
              placeholder="Virtual Seat Name"
              bind:value={newVirtualName}
              on:keydown={(e) => e.key === "Enter" && handleAddVirtual()}
            />
            <button class="btn btn-secondary btn-ghost btn-xs" on:click={handleAddVirtual} disabled={!newVirtualName.trim()}>
              + Add Seat
            </button>
          </div>
        </div>

        {#if $connectedPlayers.length === 0}
          <p class="no-players-text">No players or virtual seats at the table.</p>
        {:else}
          <div class="seats-list">
            {#each $connectedPlayers as player (player.peerId)}
              <div class="seat-item" class:virtual-seat={player.isVirtual}>
                <div class="seat-info">
                  <span class="seat-icon">{player.isVirtual ? "🤖" : "👤"}</span>
                  <span class="seat-name">{player.name}</span>
                  <span class="seat-type-badge" class:virtual={player.isVirtual}>
                    {player.isVirtual ? "Virtual" : "Peered"}
                  </span>
                  {#if player.isVirtual}
                    <span class="seat-card-count">({($virtualPlayerHands[player.peerId] || []).length} cards)</span>
                  {/if}
                </div>
                <div class="seat-actions">
                  {#if player.isVirtual}
                    <button class="btn btn-secondary btn-xs" on:click={() => inspectingPlayerId = player.peerId}>
                      👁️ Inspect
                    </button>
                    <button class="btn-kick" on:click={() => removeVirtualPlayer(player.peerId)} title="Remove seat">
                      ✕
                    </button>
                  {:else}
                    {#if $currentCard}
                      <button class="btn btn-ghost btn-send-private btn-xs" on:click={() => sendCardTo(player.peerId, $currentCard)}>
                        📨 Send Card
                      </button>
                    {:else}
                      <span class="peered-label">Connected</span>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="host-preview-section">
        <h3>Currently Shared Card</h3>
        <p class="preview-explanation">Drawn cards automatically sync to all devices by default.</p>
        <div class="card-status-bar">
          Status: {$syncState === "connected" ? "Broadcasting live" : "Ready"}
        </div>
      </div>
    </div>

  {:else if $syncRole === "client"}
    <div class="sync-active-container">
      <div class="status-header">
        <span class="status-indicator" class:connected={$syncState === "connected"} class:connecting={$syncState === "connecting"}>
          {#if $syncState === "connected"}
            ● CONNECTED AS {$playerName.toUpperCase()} (TABLE: {$roomCode})
          {:else if $syncState === "connecting"}
            ● CONNECTING
          {:else}
            ● DISCONNECTED
          {/if}
        </span>
        <div style="display: flex; gap: 8px; align-items: center;">
          {#if $syncState === "connected"}
            <button class="btn btn-secondary btn-ghost btn-sm" style="font-size: 0.65rem;" on:click={() => showDiscardPile = true}>
              🗂️ Discard Pile ({$discardPile.length})
            </button>
          {/if}
          <button class="btn btn-secondary btn-ghost" on:click={disconnect}>Disconnect</button>
        </div>
      </div>

      {#if $syncState === "connecting"}
        <div class="client-waiting">
          <div class="pulse-icon">⚡</div>
          <h2>Connecting to host...</h2>
          <p>Please wait while we establish a secure peer-to-peer connection.</p>
        </div>
      {:else if $syncState === "error"}
        <div class="client-error">
          <div class="error-icon">⚠️</div>
          <h2>Connection Error</h2>
          <p class="error-msg">{$syncError || "Could not connect to room."}</p>
          <button class="btn btn-primary" on:click={() => joinTable($roomCode, $playerName)}>Retry</button>
        </div>
      {:else}
        <!-- Connected client view -->
        {#if !$sharedCard}
          <div class="client-waiting">
            <div class="pulse-icon">✦</div>
            <h2>Waiting for GM...</h2>
            <p>Once the GM draws, broadcasts, or assigns you a card, it will appear here instantly.</p>
          </div>
        {:else}
          <div class="card-stage">
            {#if $sharedCard}
              {#if $globalBroadcastCard && $sharedCard.id !== $globalBroadcastCard.id}
                <div class="private-card-banner">
                  <span>🕵️ Viewing Private Hand Card</span>
                  <button class="btn btn-ghost btn-sm btn-return-table" on:click={returnToGlobal}>
                    Return to Shared Card
                  </button>
                </div>
              {:else}
                <!-- Show simple notification that it's a private card if table is clear -->
                {#if !$globalBroadcastCard && $receivedCards.some(c => c.id === $sharedCard.id)}
                  <div class="private-card-banner">
                    <span>🕵️ Viewing Private Hand Card</span>
                  </div>
                {/if}
              {/if}
            {/if}

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="card-frame"
              class:flippable={hasBoth}
              class:flipped={$sharedCardFlipped}
              id="shared-card-frame"
              on:click={handleCardClick}
            >
              <div class="card-inner">
                <div class="card-face front">
                  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                  <img
                    src={$sharedCard.front}
                    alt=""
                    on:click={(e) => {
                      if (!hasBoth) {
                        e.stopPropagation();
                        lightboxSrc.set($sharedCard.front);
                      }
                    }}
                  />
                </div>
                <div class="card-face back">
                  {#if hasBoth}
                    <img
                      src={$sharedCard.back}
                      alt=""
                    />
                  {/if}
                </div>
              </div>
            </div>

            {#if $sharedCard.annotations && $sharedCard.annotations.length > 0}
              <div class="card-annotations-display">
                {#each $sharedCard.annotations as note}
                  <span class="card-annotation-badge">📌 {note}</span>
                {/each}
              </div>
            {/if}

            <div class="card-meta">
              <span class="card-num">Page {$sharedCard.pageNum}</span>
              <div style="display: flex; gap: 8px;">
                <button 
                  class="btn btn-ghost btn-text-toggle" 
                  disabled={!$sharedCard}
                  on:click={() => lightboxSrc.set($sharedCardFlipped ? $sharedCard.back : $sharedCard.front)}
                >
                  🔍 Zoom
                </button>
                <button 
                  class="btn btn-ghost btn-text-toggle" 
                  disabled={!$sharedCard.text}
                  on:click={() => sharedCardShowText.update((v) => !v)}
                >
                  ≡ Text
                </button>
                <button 
                  class="btn btn-ghost btn-text-toggle"
                  class:active={showNotesEditor}
                  disabled={!$sharedCard}
                  on:click={() => showNotesEditor = !showNotesEditor}
                >
                  ✏️ Notes
                </button>
                {#if $receivedCards.some(c => c.id === $sharedCard.id)}
                  <button 
                    class="btn btn-ghost btn-text-toggle"
                    class:active={showPassMenu}
                    on:click={() => showPassMenu = !showPassMenu}
                  >
                    🤝 Pass
                  </button>
                  <button 
                    class="btn btn-ghost btn-text-toggle btn-discard-card"
                    on:click={() => discardCardToPile($sharedCard)}
                  >
                    🗑️ Discard
                  </button>
                {/if}
              </div>
            </div>

            {#if hasBoth}
              <div class="flip-hint">Tap card to flip</div>
            {/if}

            {#if $sharedCardShowText && $sharedCard.text}
              <div class="card-text-panel visible">{$sharedCard.text}</div>
            {/if}

            {#if showNotesEditor}
              <div class="notes-editor-panel">
                <div class="notes-header">
                  <h5>Card Annotations</h5>
                  <button class="btn-close-notes" on:click={() => showNotesEditor = false}>×</button>
                </div>
                
                <div class="notes-list">
                  {#each ($sharedCard.annotations || []) as note, i}
                    <div class="note-item">
                      <span>📌 {note}</span>
                      {#if isEditable}
                        <button class="btn-delete-note" on:click={() => removeAnnotation(i)}>×</button>
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
                      on:keydown={(e) => e.key === "Enter" && addAnnotation()}
                    />
                    <button class="btn btn-primary btn-sm" on:click={addAnnotation} disabled={!newNoteText.trim()}>
                      Add
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Personal Player Hand Collection -->
        {#if $receivedCards.length > 0}
          <div class="player-hand-section">
            <div class="hand-header">
              <h4>My Cards ({$receivedCards.length})</h4>
              <button class="btn btn-ghost btn-clear-hand" on:click={clearHand}>Discard Hand</button>
            </div>
            <div class="hand-scroll">
              {#each $receivedCards as card (card.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div 
                  class="hand-card-thumb" 
                  class:active={$sharedCard && $sharedCard.id === card.id} 
                  on:click={() => {
                    sharedCard.set(card);
                    sharedCardFlipped.set(false);
                    sharedCardShowText.set(false);
                  }}
                >
                  <img src={card.front} alt="" />
                  <span class="hand-card-num">p{card.pageNum}</span>
                  <button 
                    class="btn-thumb-discard" 
                    title="Discard Card"
                    on:click|stopPropagation={() => discardCardToPile(card)}
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
  {/if}

  {#if showPassMenu}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="pass-menu-overlay" on:click={() => showPassMenu = false}>
      <div class="pass-menu" on:click|stopPropagation>
        <h4>Pass Card to:</h4>
        {#if $connectedPlayers.length === 0}
          <p class="no-players-hint">No other players connected</p>
        {:else}
          <div class="pass-player-list">
            {#each $connectedPlayers as player (player.peerId)}
              <button 
                class="btn btn-secondary btn-sm pass-player-btn"
                on:click={() => {
                  passCardTo(player.peerId, $sharedCard);
                  showPassMenu = false;
                }}
              >
                👤 {player.name}
              </button>
            {/each}
          </div>
        {/if}
        <button class="btn btn-ghost btn-sm close-pass-btn" on:click={() => showPassMenu = false}>
          Cancel
        </button>
      </div>
    </div>
  {/if}

  {#if showDiscardPile}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="discard-modal-overlay" on:click={() => showDiscardPile = false}>
      <div class="discard-modal" on:click|stopPropagation>
        <div class="discard-modal-header">
          <h3>Shared Discard Pile ({$discardPile.length})</h3>
          <button class="btn-close-modal" on:click={() => showDiscardPile = false}>×</button>
        </div>
        
        <div class="discard-modal-content">
          {#if $discardPile.length === 0}
            <p class="empty-pile-text">The discard pile is currently empty.</p>
          {:else}
            <div class="discard-grid">
              {#each $discardPile as card (card.id)}
                <div class="discard-item">
                  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                  <img src={card.front} alt="" on:click={() => lightboxSrc.set(card.front)} />
                  <div class="discard-item-info">
                    <span>Page {card.pageNum}</span>
                    {#if card.annotations && card.annotations.length > 0}
                      <div class="discard-item-notes">
                        {#each card.annotations as note}
                          <span class="mini-note">📌 {note}</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <button 
                    class="btn btn-primary btn-sm btn-recall-card"
                    on:click={() => {
                      requestRecall(card.id);
                      showDiscardPile = false;
                    }}
                  >
                    🔄 Recall
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if inspectingPlayerId}
    {@const targetPlayer = $connectedPlayers.find(p => p.peerId === inspectingPlayerId)}
    {@const targetHand = $virtualPlayerHands[inspectingPlayerId] || []}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="discard-modal-overlay" on:click={() => inspectingPlayerId = null}>
      <div class="discard-modal" on:click|stopPropagation>
        <div class="discard-modal-header">
          <h3>🤖 {targetPlayer ? targetPlayer.name : "Virtual Player"}'s Hand ({targetHand.length})</h3>
          <button class="btn-close-modal" on:click={() => inspectingPlayerId = null}>×</button>
        </div>

        <div class="discard-modal-content">
          {#if targetHand.length === 0}
            <p class="empty-pile-text">This player's hand is currently empty.</p>
          {:else}
            <div class="discard-grid">
              {#each targetHand as card (card.id)}
                <div class="discard-item">
                  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                  <img
                    src={virtualCardFlips[card.id] ? card.back : card.front}
                    alt=""
                    on:click={() => lightboxSrc.set(virtualCardFlips[card.id] ? card.back : card.front)}
                  />
                  <div class="discard-item-info">
                    <span>Page {card.pageNum}</span>
                    {#if card.annotations && card.annotations.length > 0}
                      <div class="discard-item-notes">
                        {#each card.annotations as note}
                          <span class="mini-note">📌 {note}</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <div class="virtual-card-actions">
                    {#if card.back}
                      <button
                        class="btn btn-secondary btn-xs"
                        style="flex-grow: 1; padding: 4px 6px;"
                        on:click={() => virtualCardFlips[card.id] = !virtualCardFlips[card.id]}
                      >
                        🔄 {virtualCardFlips[card.id] ? "Front" : "Back"}
                      </button>
                    {/if}
                    <button
                      class="btn btn-danger btn-xs"
                      style="padding: 4px 6px;"
                      on:click={() => inspectingPlayerId && discardVirtualCard(inspectingPlayerId, card)}
                    >
                      🗑️ Discard
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .sync-choice-container {
    text-align: center;
    padding: 20px 10px;
  }
  .sync-title {
    font-family: "Cinzel", Georgia, serif;
    color: var(--amber);
    font-size: 1.8rem;
    margin-bottom: 8px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .sync-subtitle {
    color: var(--text-dim);
    font-style: italic;
    font-size: 1.05rem;
    margin-bottom: 30px;
  }
  .choice-cards {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0 auto;
    max-width: 500px;
  }
  @media (min-width: 600px) {
    .choice-cards {
      flex-direction: row;
      max-width: 100%;
      align-items: stretch;
    }
  }
  .choice-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-shadow: var(--shadow);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .choice-card:hover {
    border-color: var(--amber-dim);
    box-shadow: 0 8px 30px rgba(212, 148, 58, 0.05);
  }
  .choice-icon {
    font-size: 2.5rem;
    line-height: 1;
  }
  .choice-card h3 {
    font-family: "Cinzel", serif;
    color: var(--text);
    font-size: 1.1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .choice-card p {
    color: var(--text-dim);
    font-size: 0.95rem;
    line-height: 1.5;
    text-align: center;
    flex-grow: 1;
  }
  .join-input-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .join-input-group input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 12px;
    font-family: "Cinzel", monospace;
    font-size: 1.1rem;
    text-align: center;
    letter-spacing: 0.3em;
    outline: none;
  }
  .join-input-group input::placeholder {
    font-family: "Crimson Pro", Georgia, serif;
    letter-spacing: 0;
    font-size: 0.95rem;
    color: var(--text-muted);
  }
  .join-input-group input:focus {
    border-color: var(--amber-dim);
    box-shadow: 0 0 10px rgba(212, 148, 58, 0.1);
  }
  .join-input-group button {
    width: 100%;
  }

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

  .host-info-panel {
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: var(--shadow), var(--glow);
    position: relative;
    overflow: hidden;
  }
  @media (min-width: 500px) {
    .host-info-panel {
      flex-direction: row;
      justify-content: space-between;
      text-align: left;
    }
  }
  .host-info-panel::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--amber), transparent);
  }
  .info-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  @media (min-width: 500px) {
    .info-details {
      align-items: flex-start;
    }
  }
  .info-details h2 {
    font-family: "Cinzel", serif;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    color: var(--text-dim);
    text-transform: uppercase;
  }
  .room-code-display {
    font-family: "Cinzel", monospace;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--amber);
    letter-spacing: 0.1em;
    line-height: 1.2;
    text-shadow: 0 0 15px rgba(212, 148, 58, 0.3);
  }
  .connection-status {
    color: var(--text-dim);
    font-size: 0.95rem;
  }
  .connection-status strong {
    color: var(--amber);
  }
  .qr-code-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .qr-code-label {
    font-family: "Cinzel", serif;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .qr-code-box {
    background: #e8e4d8;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--amber-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 180px;
    height: 180px;
  }
  .qr-placeholder {
    color: var(--bg);
    font-style: italic;
    font-size: 0.9rem;
  }

  /* Connected Player Grid */
  .no-players-text {
    color: var(--text-muted);
    font-size: 0.9rem;
    font-style: italic;
    text-align: center;
    padding: 10px;
  }
  .btn-send-private {
    font-size: 0.65rem;
    padding: 6px 12px;
    background: rgba(212, 148, 58, 0.1);
    border: 1px solid rgba(212, 148, 58, 0.4);
    color: var(--amber2);
  }
  .btn-send-private:hover {
    background: rgba(212, 148, 58, 0.2);
    border-color: var(--amber);
  }

  /* Player Hand Scroll Section */
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

  .host-preview-section {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    text-align: center;
  }
  .host-preview-section h3 {
    font-family: "Cinzel", serif;
    color: var(--amber);
    font-size: 0.9rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .preview-explanation {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
    margin-bottom: 12px;
  }
  .card-status-bar {
    font-size: 0.85rem;
    color: var(--text-dim);
    background: var(--bg);
    padding: 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    display: inline-block;
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
  .error-text {
    color: var(--red);
  }
  .btn-text-toggle {
    font-size: 0.65rem;
    padding: 6px 12px;
  }

  .private-card-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(212, 148, 58, 0.06);
    border: 1px solid rgba(212, 148, 58, 0.2);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 16px;
    width: 100%;
    max-width: 420px;
    box-sizing: border-box;
    font-family: "Cinzel", serif;
    font-size: 0.72rem;
    color: var(--amber2);
    letter-spacing: 0.05em;
  }
  .btn-return-table {
    font-size: 0.65rem;
    padding: 4px 8px;
    background: rgba(212, 148, 58, 0.1);
    border: 1px solid rgba(212, 148, 58, 0.35);
    color: var(--amber2);
  }
  .btn-return-table:hover {
    background: rgba(212, 148, 58, 0.2);
    border-color: var(--amber);
  }
  .btn-discard-card {
    border-color: rgba(196, 80, 64, 0.4) !important;
    color: var(--red) !important;
  }
  .btn-discard-card:hover {
    background: rgba(196, 80, 64, 0.1) !important;
    border-color: var(--red) !important;
  }
  .btn-thumb-discard {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(8, 8, 16, 0.85);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.75rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, color 0.2s, background-color 0.2s;
    padding: 0;
    z-index: 10;
  }
  .hand-card-thumb:hover .btn-thumb-discard {
    opacity: 1;
  }
  .btn-thumb-discard:hover {
    background: var(--red);
    color: var(--text);
    border-color: var(--red);
  }

  /* Annotations Display */
  .card-annotations-display {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
    justify-content: center;
    width: 100%;
  }
  .card-annotation-badge {
    background: rgba(212, 148, 58, 0.12);
    border: 1px solid rgba(212, 148, 58, 0.3);
    color: var(--amber2);
    font-size: 0.7rem;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: "Crimson Pro", serif;
  }

  /* Notes Editor Panel */
  .notes-editor-panel {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    margin-top: 16px;
    width: 100%;
    max-width: 420px;
    box-sizing: border-box;
    text-align: left;
  }
  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .notes-header h5 {
    font-family: "Cinzel", serif;
    font-size: 0.75rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .btn-close-notes {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
  }
  .btn-close-notes:hover {
    color: var(--text);
  }
  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 120px;
    overflow-y: auto;
    margin-bottom: 10px;
  }
  .no-notes-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
    margin: 4px 0;
  }
  .note-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg4);
    border: 1px solid var(--border2);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 0.82rem;
    color: var(--text);
  }
  .btn-delete-note {
    background: none;
    border: none;
    color: var(--red);
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    padding: 0;
  }
  .btn-delete-note:hover {
    color: #ff6050;
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
    font-family: "Crimson Pro", serif;
    outline: none;
  }
  .add-note-group input:focus {
    border-color: var(--amber-dim);
  }

  /* Pass Card Menu Popover */
  .pass-menu-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(4, 4, 8, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .pass-menu {
    background: var(--bg2);
    border: 1px solid var(--amber-dim);
    border-radius: var(--radius);
    box-shadow: var(--shadow), var(--glow);
    padding: 20px;
    width: 90%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  .pass-menu h4 {
    font-family: "Cinzel", serif;
    font-size: 0.9rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pass-player-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
  }
  .pass-player-btn {
    text-align: left;
    padding: 10px 14px;
    font-family: "Crimson Pro", serif;
    font-size: 0.95rem;
  }
  .close-pass-btn {
    margin-top: 8px;
  }

  /* Discard Modal overlay */
  .discard-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(4, 4, 8, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .discard-modal {
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-top: 3px solid var(--amber);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
  }
  .discard-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .discard-modal-header h3 {
    font-family: "Cinzel", serif;
    font-size: 1.05rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .btn-close-modal {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .btn-close-modal:hover {
    color: var(--text);
  }
  .discard-modal-content {
    overflow-y: auto;
    flex-grow: 1;
    padding-right: 4px;
    scrollbar-width: thin;
  }
  .empty-pile-text {
    color: var(--text-muted);
    font-style: italic;
    padding: 30px 10px;
    text-align: center;
  }
  .discard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 16px;
  }
  .discard-item {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.2s;
    justify-content: space-between;
  }
  .discard-item:hover {
    border-color: var(--border2);
  }
  .discard-item img {
    width: 100%;
    aspect-ratio: 2.5/3.5;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .discard-item img:hover {
    opacity: 0.9;
  }
  .discard-item-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }
  .discard-item-info span {
    font-size: 0.72rem;
    color: var(--text-dim);
  }
  .discard-item-notes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
  }
  .mini-note {
    font-size: 0.62rem;
    color: var(--amber2);
    background: rgba(212, 148, 58, 0.08);
    padding: 1px 4px;
    border-radius: 2px;
    border: 1px solid rgba(212, 148, 58, 0.15);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .btn-recall-card {
    font-size: 0.7rem;
    padding: 6px;
    width: 100%;
    margin-top: auto;
  }

  /* Seats Manager Panel */
  .seats-manager-panel {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: left;
  }
  .seats-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .seats-header-row h3 {
    font-family: "Cinzel", serif;
    font-size: 0.95rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .add-virtual-form {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .add-virtual-form input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 6px 10px;
    font-size: 0.82rem;
    font-family: "Crimson Pro", serif;
    outline: none;
    width: 160px;
  }
  .add-virtual-form input:focus {
    border-color: var(--amber-dim);
  }
  .seats-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .seat-item {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: border-color 0.2s;
  }
  .seat-item:hover {
    border-color: var(--border2);
  }
  .seat-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "Crimson Pro", serif;
    font-size: 0.95rem;
  }
  .seat-icon {
    font-size: 1.1rem;
  }
  .seat-name {
    color: var(--text);
    font-weight: 600;
  }
  .seat-type-badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    font-weight: bold;
    background: rgba(64, 112, 184, 0.15);
    border: 1px solid rgba(64, 112, 184, 0.3);
    color: #7aabee;
  }
  .seat-type-badge.virtual {
    background: rgba(212, 148, 58, 0.12);
    border: 1px solid rgba(212, 148, 58, 0.3);
    color: var(--amber2);
  }
  .seat-card-count {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .seat-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .peered-label {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .btn.btn-xs {
    padding: 4px 8px;
    font-size: 0.65rem;
    border-radius: 4px;
    min-height: auto;
  }
  .btn-kick {
    background: none;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 4px 6px;
    line-height: 1;
    transition: color 0.2s, border-color 0.2s;
  }
  .btn-kick:hover {
    color: var(--red);
    border-color: rgba(196, 80, 64, 0.3);
    background: rgba(196, 80, 64, 0.05);
  }
  .virtual-card-actions {
    display: flex;
    gap: 6px;
    width: 100%;
    margin-top: auto;
  }
</style>
