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
    startHosting,
    joinTable,
    disconnect,
  } from "../js/sync.js";
  import { lightboxSrc } from "../js/state.js";

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
    if (inputCode.trim().length === 6) {
      joinTable(inputCode.trim());
    }
  }

  function handleCardClick() {
    if (!hasBoth) return;
    sharedCardFlipped.update((v) => !v);
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
          <p>Create a game room. Drawn cards will automatically sync to all connected players' screens.</p>
          <button class="btn btn-primary" on:click={startHosting}>Host Room</button>
        </div>

        <!-- JOIN CARD -->
        <div class="choice-card join-card">
          <div class="choice-icon">🔌</div>
          <h3>Join Table (Player)</h3>
          <p>Enter a 6-digit room code to connect to a GM's table and view their draws.</p>
          
          <div class="join-input-group">
            <input 
              type="text" 
              placeholder="Enter 6-digit code" 
              maxlength="6" 
              bind:value={inputCode} 
              on:keydown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button class="btn btn-secondary" on:click={handleJoin} disabled={inputCode.length !== 6}>
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

      <div class="host-preview-section">
        <h3>Currently Shared Card</h3>
        <p class="preview-explanation">Connected players see your drawn card in real time.</p>
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
            ● CONNECTED TO TABLE: {$roomCode}
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
          <button class="btn btn-primary" on:click={() => joinTable($roomCode)}>Retry</button>
        </div>
      {:else}
        <!-- Connected client view -->
        {#if !$sharedCard}
          <div class="client-waiting">
            <div class="pulse-icon">✦</div>
            <h2>Waiting for GM to draw...</h2>
            <p>Once the GM draws or reveals a card, it will appear here instantly.</p>
          </div>
        {:else}
          <div class="card-stage">
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
                    on:click|stopPropagation={() => lightboxSrc.set($sharedCard.front)}
                  />
                </div>
                <div class="card-face back">
                  {#if hasBoth}
                    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                    <img
                      src={$sharedCard.back}
                      alt=""
                      on:click|stopPropagation={() => lightboxSrc.set($sharedCard.back)}
                    />
                  {/if}
                </div>
              </div>
            </div>

            <div class="card-meta">
              <span class="card-num">Page {$sharedCard.pageNum}</span>
              <button 
                class="btn btn-ghost btn-text-toggle" 
                disabled={!$sharedCard.text}
                on:click={() => sharedCardShowText.update((v) => !v)}
              >
                ≡ Text
              </button>
            </div>

            {#if hasBoth}
              <div class="flip-hint">Tap card to flip</div>
            {/if}

            {#if $sharedCardShowText && $sharedCard.text}
              <div class="card-text-panel visible">{$sharedCard.text}</div>
            {/if}
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
</style>
