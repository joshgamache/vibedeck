<script lang="ts">
  import QRCode from "qrcode";
  import { syncState, disconnect, removeVirtualPlayer, sendCardTo, addVirtualPlayer } from "../js/sync.svelte";
  import { appState } from "../js/state.svelte";

  // Bindable properties
  let { showDiscardPile = $bindable(), inspectingPlayerId = $bindable() } = $props();

  let newVirtualName = $state("");
  let qrCanvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    if (qrCanvas && syncState.roomCode && syncState.role === "host") {
      setTimeout(renderQRCode, 50);
    }
  });

  async function renderQRCode() {
    if (!qrCanvas) return;
    const joinUrl = `${window.location.origin}${window.location.pathname}?table=${syncState.roomCode}`;
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

  function handleAddVirtual() {
    if (newVirtualName.trim()) {
      addVirtualPlayer(newVirtualName.trim());
      newVirtualName = "";
    }
  }
</script>

<div class="sync-active-container">
  <div class="status-header">
    <span class="status-indicator connected">● HOSTING</span>
    <div style="display: flex; gap: 8px; align-items: center;">
      <button class="btn btn-secondary btn-ghost btn-sm" style="font-size: 0.65rem;" onclick={() => showDiscardPile = true}>
        🗂️ Discard Pile ({syncState.discardPile.length})
      </button>
      <button class="btn btn-danger btn-ghost" onclick={disconnect}>Stop Hosting</button>
    </div>
  </div>

  <div class="host-info-panel">
    <div class="info-details">
      <h2>Room Code</h2>
      <div class="room-code-display">{syncState.roomCode}</div>
      <p class="connection-status">
        {#if syncState.connectionState === "connecting"}
          Creating table...
        {:else if syncState.connectionState === "connected"}
          Waiting for players... <strong>{syncState.clientCount}</strong> connected
        {:else if syncState.connectionState === "error"}
          <span class="error-text">{syncState.syncError || "Failed to connect"}</span>
        {/if}
      </p>
    </div>
    
    <div class="qr-code-wrapper">
      <div class="qr-code-label">Scan to Join</div>
      <div class="qr-code-box">
        {#if !syncState.roomCode}
          <div class="qr-placeholder">Generating...</div>
        {/if}
        <canvas bind:this={qrCanvas} style="display: {syncState.roomCode ? 'block' : 'none'}; width: 160px; height: 160px;"></canvas>
      </div>
    </div>
  </div>

  <div class="seats-manager-panel">
    <div class="seats-header-row">
      <h3>Table Seats ({syncState.connectedPlayers.length})</h3>
      <div class="add-virtual-form">
        <input
          type="text"
          placeholder="Virtual Seat Name"
          bind:value={newVirtualName}
          onkeydown={(e) => e.key === "Enter" && handleAddVirtual()}
        />
        <button class="btn btn-secondary btn-ghost btn-xs" onclick={handleAddVirtual} disabled={!newVirtualName.trim()}>
          + Add Seat
        </button>
      </div>
    </div>

    {#if syncState.connectedPlayers.length === 0}
      <p class="no-players-text">No players or virtual seats at the table.</p>
    {:else}
      <div class="seats-list">
        {#each syncState.connectedPlayers as player (player.peerId)}
          <div class="seat-item" class:virtual-seat={player.isVirtual}>
            <div class="seat-info">
              <span class="seat-icon">{player.isVirtual ? "🤖" : "👤"}</span>
              <span class="seat-name">{player.name}</span>
              <span class="seat-type-badge" class:virtual={player.isVirtual}>
                {player.isVirtual ? "Virtual" : "Peered"}
              </span>
              {#if player.isVirtual}
                <span class="seat-card-count">({(syncState.virtualPlayerHands[player.peerId] || []).length} cards)</span>
              {/if}
            </div>
            <div class="seat-actions">
              {#if player.isVirtual}
                <button class="btn btn-secondary btn-xs" onclick={() => inspectingPlayerId = player.peerId}>
                  👁️ Inspect
                </button>
                <button class="btn-kick" onclick={() => removeVirtualPlayer(player.peerId)} title="Remove seat">
                  ✕
                </button>
              {:else}
                {#if appState.currentCard}
                  <button class="btn btn-ghost btn-send-private btn-xs" onclick={() => sendCardTo(player.peerId, appState.currentCard)}>
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
      Status: {syncState.connectionState === "connected" ? "Broadcasting live" : "Ready"}
    </div>
  </div>
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
</style>
