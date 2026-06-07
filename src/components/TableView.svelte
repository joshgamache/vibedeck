<script>
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
  } from "../js/sync.js";
  import { currentCard, lightboxSrc } from "../js/state.js";

  let inputCode = "";
  let qrCanvas;

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

  function discardCard(cardId) {
    receivedCards.update((list) => list.filter((c) => c.id !== cardId));
    if ($sharedCard && $sharedCard.id === cardId) {
      returnToGlobal();
    }
  }

  function clearHand() {
    if (confirm("Discard all cards in your hand?")) {
      receivedCards.set([]);
      if (!$globalBroadcastCard || ($sharedCard && $sharedCard.id !== $globalBroadcastCard.id)) {
        returnToGlobal();
      }
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
        <button class="btn btn-danger btn-ghost" on:click={disconnect}>Stop Hosting</button>
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

      <div class="player-list-section">
        <h3>Connected Players</h3>
        {#if $connectedPlayers.length === 0}
          <p class="no-players-text">Waiting for players to connect...</p>
        {:else}
          <div class="player-grid">
            {#each $connectedPlayers as player (player.peerId)}
              <div class="player-item">
                <span class="player-name">👤 {player.name}</span>
                {#if $currentCard}
                  <button class="btn btn-ghost btn-send-private" on:click={() => sendCardTo(player.peerId, $currentCard)}>
                    📨 Send Current Card
                  </button>
                {:else}
                  <span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">No active card drawn</span>
                {/if}
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
          {#if $syncState === "connecting"}
            ● CONNECTING
          {:else if $syncState === "connected"}
            ● CONNECTED AS {$playerName.toUpperCase()} (TABLE: {$roomCode})
          {:else}
            ● DISCONNECTED
          {/if}
        </span>
        <button class="btn btn-secondary btn-ghost" on:click={disconnect}>Disconnect</button>
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
                {#if $receivedCards.some(c => c.id === $sharedCard.id)}
                  <button 
                    class="btn btn-ghost btn-text-toggle btn-discard-card"
                    on:click={() => discardCard($sharedCard.id)}
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
                    on:click|stopPropagation={() => discardCard(card.id)}
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
  .player-list-section {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .player-list-section h3 {
    font-family: "Cinzel", serif;
    color: var(--amber);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .no-players-text {
    color: var(--text-muted);
    font-size: 0.9rem;
    font-style: italic;
    text-align: center;
    padding: 10px;
  }
  .player-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .player-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    transition: border-color 0.2s;
  }
  .player-item:hover {
    border-color: var(--border2);
  }
  .player-name {
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 1.05rem;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 6px;
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
</style>
