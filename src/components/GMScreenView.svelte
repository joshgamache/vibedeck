<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { appState, type Card } from "../js/state.svelte";
  import { iGet, iPut, iIdx } from "../js/db";
  import { shuffle, fmtTime } from "../js/utils";
  import { showToast } from "../js/toastStore.svelte";
  import { 
    syncState, 
    sendCardTo, 
    pushCard, 
    pushFlip, 
    pushClear, 
    startHosting, 
    joinTable,
    disconnect,
    addVirtualPlayer,
    removeVirtualPlayer,
    discardVirtualCard,
    discardTableCard,
    broadcastPlayerHands
  } from "../js/sync.svelte";

  // State properties
  let layoutMode = $state<"gm-dashboard" | "table-display">(
    syncState.role === "host" ? "gm-dashboard" : "table-display"
  );
  let isFullscreen = $state(false);
  let showQR = $state(false);
  let showTextOverlay = $state(false);
  let publicHands = $state(false);
  let newVirtualName = $state("");
  let animateReveal = $state(false);
  let wakeLock = $state<any>(null);

  // QR canvas reference
  let qrCanvas = $state<HTMLCanvasElement | null>(null);

  // Derived properties
  const ds = $derived(appState.currentDeckId ? appState.drawState[appState.currentDeckId] : null);
  const deck = $derived(appState.currentDeckId ? appState.decks.find(d => d.id === appState.currentDeckId) : null);
  const progressPercent = $derived(deck && ds && deck.cardCount > 0 ? (ds.drawn.length / deck.cardCount * 100) : 0);
  const hasBothGM = $derived(appState.currentCard && appState.currentCard.front && appState.currentCard.back);
  const hasBothShared = $derived(syncState.sharedCard && syncState.sharedCard.front && syncState.sharedCard.back);
  
  const activeDisplayCard = $derived(
    layoutMode === "gm-dashboard" ? appState.currentCard : syncState.sharedCard
  );
  const activeDisplayFlipped = $derived(
    layoutMode === "gm-dashboard" ? appState.cardFlipped : syncState.sharedCardFlipped
  );

  // Wake Lock management
  async function requestWakeLock() {
    if ("wakeLock" in navigator && !wakeLock) {
      try {
        wakeLock = await (navigator as any).wakeLock.request("screen");
        console.log("Wake Lock is active!");
      } catch (err: any) {
        console.warn(`Wake Lock request failed: ${err.name}, ${err.message}`);
      }
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
        wakeLock = null;
        console.log("Wake Lock released");
      } catch (err) {
        console.error("Failed to release wake lock:", err);
      }
    }
  }

  // Manage wake lock and QR rendering based on mode
  $effect(() => {
    if (layoutMode === "table-display" && syncState.connectionState === "connected") {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
    };
  });

  $effect(() => {
    if (showQR && qrCanvas && syncState.roomCode) {
      setTimeout(renderQRCode, 50);
    }
  });

  $effect(() => {
    // Keep fullscreen reactive state in sync
    const handleFSChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
    };
  });

  // Render scan-to-join QR Code
  async function renderQRCode() {
    if (!qrCanvas || !syncState.roomCode) return;
    const joinUrl = `${window.location.origin}${window.location.pathname}?table=${syncState.roomCode}`;
    try {
      await QRCode.toCanvas(qrCanvas, joinUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: "#080810",
          light: "#e8e4d8",
        },
      });
    } catch (e) {
      console.error("Failed to generate QR code in GM Screen view", e);
    }
  }

  // Fullscreen API toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => isFullscreen = true)
        .catch(err => showToast("Could not enable fullscreen", "error"));
    } else {
      document.exitFullscreen()
        .then(() => isFullscreen = false)
        .catch(err => console.error(err));
    }
  }

  // Card drawing & deck controls (similar to DrawView)
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
    setTimeout(() => { animateReveal = false; }, 400);
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
    if (layoutMode === "gm-dashboard") {
      if (!hasBothGM) return;
      appState.cardFlipped = !appState.cardFlipped;
      if (syncState.role === 'host') {
        pushFlip(appState.cardFlipped);
      }
    } else {
      if (!hasBothShared) return;
      syncState.sharedCardFlipped = !syncState.sharedCardFlipped;
    }
  }

  function handleAddVirtual() {
    if (newVirtualName.trim()) {
      addVirtualPlayer(newVirtualName.trim());
      newVirtualName = "";
    }
  }

  // Load state on start
  $effect(() => {
    if (appState.currentDeckId) {
      loadDeckState(appState.currentDeckId);
    }
  });

  // Table joining state for clients in Tablet View
  let joinRoomCode = $state("");
  let joinPlayerName = $state(localStorage.getItem("playerName") || "Table Display");
  
  function handleJoinTable() {
    if (joinRoomCode.trim().length === 6 && joinPlayerName.trim()) {
      joinTable(joinRoomCode.trim(), joinPlayerName.trim());
    }
  }
</script>

<div class="gmscreen-container" class:fullscreen-layout={isFullscreen}>
  
  <!-- NO CONNECTION STATE -->
  {#if syncState.role === "none"}
    <div class="gms-unconnected">
      <div class="gms-unconnected-card">
        <h2 class="gms-title">Tablet Screen Coordinator</h2>
        <p class="gms-subtitle">Initialize a Host table room or connect as a Tabletop Display client.</p>
        
        <div class="gms-options">
          <div class="gms-option-box">
            <h3>Start Hosting (GM)</h3>
            <p>Host from this tablet. Draw cards, inspect players, and control the table broadcast.</p>
            <button class="btn btn-primary" onclick={startHosting}>Host Table</button>
          </div>
          
          <div class="gms-option-box">
            <h3>Connect as Table Screen</h3>
            <p>Connect this tablet to an existing GM table as a passive tabletop receiver display.</p>
            
            <div class="gms-connect-inputs">
              <input 
                type="text" 
                placeholder="Screen Name (e.g. Table Tablet)" 
                bind:value={joinPlayerName} 
              />
              <input 
                type="text" 
                placeholder="6-digit Room Code" 
                maxlength="6"
                bind:value={joinRoomCode} 
                onkeydown={(e) => e.key === "Enter" && handleJoinTable()}
              />
              <button 
                class="btn btn-secondary" 
                onclick={handleJoinTable} 
                disabled={joinRoomCode.trim().length !== 6 || !joinPlayerName.trim()}
              >
                Join Table
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  <!-- CONNECTED / ACTIVE STATE -->
  {:else}
    <!-- SLEEK BAR HEADER -->
    <header class="gms-header">
      <div class="gms-header-left">
        <span class="gms-logo">VIBEDECK // SCREEN</span>
        <span class="gms-badge" class:host-badge={syncState.role === "host"} class:client-badge={syncState.role === "client"}>
          {syncState.role === "host" ? "HOST/GM" : "RECEIVER CLIENT"}
        </span>
        <span class="gms-code">ROOM: {syncState.roomCode}</span>
      </div>

      <div class="gms-header-center">
        <button 
          class="gms-mode-toggle" 
          class:active={layoutMode === "gm-dashboard"} 
          onclick={() => layoutMode = "gm-dashboard"}
          disabled={syncState.role !== "host"}
          title={syncState.role !== "host" ? "Only available when hosting" : ""}
        >
          GM Dashboard
        </button>
        <button 
          class="gms-mode-toggle" 
          class:active={layoutMode === "table-display"} 
          onclick={() => layoutMode = "table-display"}
        >
          Table Display
        </button>
      </div>

      <div class="gms-header-right">
        {#if layoutMode === "table-display"}
          <button class="btn-icon" onclick={() => publicHands = !publicHands} title={publicHands ? "Hide Hand Cards" : "Show Hand Cards"}>
            {publicHands ? "👁️ Public Hands" : "🕵️ Private Hands"}
          </button>
          <button class="btn-icon" onclick={() => showTextOverlay = !showTextOverlay} title="Toggle Text Overlay">
            📄 Text
          </button>
        {/if}
        <button class="btn-icon" onclick={() => showQR = !showQR} title="Toggle QR Code Join">
          📱 QR Join
        </button>
        <button class="btn-icon" onclick={toggleFullscreen} title="Toggle Fullscreen">
          {isFullscreen ? "🗖 Window" : "🖥️ Fullscreen"}
        </button>
        <button class="btn-icon btn-close-conn" onclick={disconnect} title="Disconnect session">
          🔌 Disconnect
        </button>
      </div>
    </header>

    <!-- WRAPPER BASED ON SELECTED LAYOUT -->
    <main class="gms-content-wrapper">
      
      <!-- ==================== LAYOUT A: GM DASHBOARD ==================== -->
      {#if layoutMode === "gm-dashboard"}
        <div class="gms-dashboard-grid">
          
          <!-- LEFT SIDE: DRAWING CONSOLE -->
          <section class="gms-card-console">
            <div class="gms-panel-inner">
              <div class="panel-header">
                <h4>Card Console</h4>
                <span class="card-count-indicator">{(ds ? ds.remaining.length : 0)} left</span>
              </div>
              
              <div class="deck-selector-bar">
                <span class="deck-label">Active Deck:</span>
                <select class="deck-select" bind:value={appState.currentDeckId} onchange={onDeckChange}>
                  {#each appState.decks as d (d.id)}
                    <option value={d.id}>{d.name}</option>
                  {:else}
                    <option value="">— No decks imported —</option>
                  {/each}
                </select>
              </div>

              <div class="deck-progress">
                <div class="deck-progress-bar">
                  <div class="deck-progress-fill" style="width: {progressPercent}%"></div>
                </div>
                <div class="deck-progress-text">
                  <span>{(ds ? ds.drawn.length : 0)} drawn</span>
                  <span>{(deck ? deck.cardCount : 0)} total</span>
                </div>
              </div>

              <div class="gms-draw-stage">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  class="card-frame" 
                  class:flippable={hasBothGM}
                  class:flipped={appState.cardFlipped}
                  class:revealing={animateReveal}
                  onclick={handleCardClick}
                >
                  <div class="card-inner">
                    <div class="card-face front">
                      {#if !appState.currentCard}
                        <div class="card-empty">
                          <div class="card-empty-symbol">✦</div>
                          <div class="card-empty-text">No card drawn</div>
                        </div>
                      {:else}
                        <img src={appState.currentCard.front} alt="" />
                      {/if}
                    </div>
                    <div class="card-face back">
                      {#if appState.currentCard && hasBothGM}
                        <img src={appState.currentCard.back} alt="" />
                      {/if}
                    </div>
                  </div>
                </div>

                {#if appState.currentCard}
                  <div class="card-meta">
                    <span class="card-num">Page {appState.currentCard.pageNum}</span>
                    <button class="btn btn-ghost btn-xs" onclick={() => appState.lightboxSrc = appState.cardFlipped ? appState.currentCard!.back : appState.currentCard!.front}>
                      🔍 Zoom
                    </button>
                  </div>
                  {#if hasBothGM}
                    <div class="flip-hint">Tap card to flip</div>
                  {/if}
                {/if}
              </div>

              <div class="console-actions">
                <button 
                  class="btn btn-primary" 
                  onclick={drawCard} 
                  disabled={!appState.currentDeckId || !ds || !ds.remaining.length}
                >
                  ✦ Draw Card
                </button>
                <button 
                  class="btn btn-secondary" 
                  onclick={reshuffleDeck} 
                  disabled={!appState.currentDeckId}
                >
                  ↺ Reshuffle
                </button>
              </div>
            </div>
          </section>

          <!-- RIGHT SIDE: SESSION & SEATS COORDINATION -->
          <section class="gms-session-controls">
            <div class="gms-panel-inner">
              <div class="panel-header">
                <h4>Table Settings</h4>
                <span class="clients-indicator">📡 {syncState.clientCount} Peer{syncState.clientCount === 1 ? '' : 's'}</span>
              </div>

              <!-- AUTO SHARE SELECTOR -->
              <div class="gm-panel-section">
                <label for="dash-share" class="gm-panel-label">Auto-Share Mode</label>
                <select id="dash-share" class="gm-select" bind:value={syncState.autoShareMode}>
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

              <!-- CURRENT CARD MANUAL ACTIONS -->
              {#if appState.currentCard}
                <div class="gm-panel-section">
                  <span class="gm-panel-label">Broadcast Controls</span>
                  <div class="gm-action-buttons">
                    <button class="btn btn-primary btn-sm" onclick={() => pushCard(appState.currentCard)}>
                      📢 Share to Table
                    </button>
                    <button class="btn btn-secondary btn-sm btn-clear-table" onclick={pushClear}>
                      ❌ Clear Table
                    </button>
                  </div>
                </div>

                <div class="gm-panel-section">
                  <span class="gm-panel-label">Private Distribution</span>
                  {#if syncState.connectedPlayers.length === 0}
                    <div class="no-players-hint">No connected players at the table.</div>
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

              <!-- SEAT MANAGEMENT -->
              <div class="gm-panel-section seats-section">
                <div class="seats-header">
                  <span class="gm-panel-label">Table Seats ({syncState.connectedPlayers.length})</span>
                  <div class="add-seat-inline">
                    <input 
                      type="text" 
                      placeholder="Virtual Name" 
                      bind:value={newVirtualName} 
                      onkeydown={(e) => e.key === "Enter" && handleAddVirtual()}
                    />
                    <button onclick={handleAddVirtual} disabled={!newVirtualName.trim()}>+ Add</button>
                  </div>
                </div>

                <div class="seats-dashboard-list">
                  {#each syncState.connectedPlayers as player (player.peerId)}
                    {@const hand = syncState.playerHands[player.peerId] || []}
                    <div class="seat-dashboard-item" class:virtual={player.isVirtual}>
                      <div class="seat-left">
                        <span class="seat-icon">{player.isVirtual ? "🤖" : "👤"}</span>
                        <span class="seat-name">{player.name}</span>
                        <span class="seat-count">({hand.length} cards)</span>
                      </div>
                      <div class="seat-actions">
                        {#if player.isVirtual}
                          <button class="btn btn-danger btn-xs" onclick={() => removeVirtualPlayer(player.peerId)}>Kick</button>
                        {:else}
                          <span class="peered-indicator">Connected</span>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="no-players-hint">No active peered or virtual seats at this table.</div>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        </div>

      <!-- ==================== LAYOUT B: TABLE DISPLAY ==================== -->
      {:else}
        <div class="gms-table-display">
          
          <!-- MAIN SHOW-EM CARD DISPLAY STAGE -->
          <div class="gms-showem-stage">
            {#if syncState.sharedCard}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                class="card-frame showem-card" 
                class:flippable={hasBothShared}
                class:flipped={syncState.sharedCardFlipped}
                onclick={handleCardClick}
              >
                <div class="card-inner">
                  <div class="card-face front">
                    <img src={syncState.sharedCard.front} alt="" />
                  </div>
                  <div class="card-face back">
                    {#if hasBothShared}
                      <img src={syncState.sharedCard.back} alt="" />
                    {/if}
                  </div>
                </div>
              </div>

              <!-- ANNOTATIONS -->
              {#if syncState.sharedCard.annotations && syncState.sharedCard.annotations.length > 0}
                <div class="showem-annotations">
                  {#each syncState.sharedCard.annotations as note}
                    <span class="showem-annotation-badge">📌 {note}</span>
                  {/each}
                </div>
              {/if}

              <!-- TEXT OVERLAY PARCHMENT -->
              {#if showTextOverlay && syncState.sharedCard.text}
                <div class="showem-text-overlay">
                  <div class="overlay-header">
                    <h5>Card Details</h5>
                    <button onclick={() => showTextOverlay = false}>×</button>
                  </div>
                  <div class="overlay-content">{syncState.sharedCard.text}</div>
                </div>
              {/if}
            {:else}
              <!-- GLOWING RUNIC PLACEHOLDER -->
              <div class="gms-placeholder">
                <div class="runic-seal-wrapper">
                  <div class="runic-glow"></div>
                  <div class="runic-seal">✦</div>
                </div>
                <h3>Awaiting Transmission</h3>
                <p>The screen is active. Pushed cards and show-ems will appear here automatically.</p>
              </div>
            {/if}
          </div>

          <!-- LOWER-SIXTH TRAY (PLAYER HANDS) -->
          <section class="gms-lower-sixth">
            <div class="lower-sixth-header">
              <span class="lower-title">PLAYER HANDS</span>
              <span class="lower-status">Table Status: {syncState.connectedPlayers.length} seat{syncState.connectedPlayers.length === 1 ? '' : 's'} registered</span>
            </div>

            <div class="lower-sixth-pods-container">
              {#each syncState.connectedPlayers as player (player.peerId)}
                {@const hand = syncState.playerHands[player.peerId] || []}
                <div class="player-pod" class:virtual-pod={player.isVirtual}>
                  <div class="pod-info">
                    <span class="pod-icon">{player.isVirtual ? "🤖" : "👤"}</span>
                    <span class="pod-name">{player.name}</span>
                    <span class="pod-count">{hand.length}</span>
                  </div>
                  <div class="pod-cards-scroll">
                    {#each hand as card (card.id)}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                      <img 
                        src={publicHands ? card.front : (card.back || card.front)} 
                        alt="" 
                        class="pod-card-thumb"
                        class:private-card-back={!publicHands}
                        onclick={() => {
                          if (syncState.role === "host") {
                            // Let the host zoom or discard card
                            if (confirm(`Action for ${player.name}'s card (Page ${card.pageNum}):\n\n[OK] to Zoom card\n[Cancel] to do nothing`)) {
                              appState.lightboxSrc = publicHands ? card.front : (card.back || card.front);
                            }
                          } else {
                            // Peered player can only zoom
                            appState.lightboxSrc = publicHands ? card.front : (card.back || card.front);
                          }
                        }}
                      />
                    {:else}
                      <span class="empty-hand-label">Empty Hand</span>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="pods-empty-state">No players at the table. Scan QR to join.</div>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </main>
  {/if}

  <!-- SCAN-TO-JOIN QR CODE POPUP -->
  {#if showQR && syncState.roomCode}
    <div class="qr-overlay" onclick={() => showQR = false}>
      <div class="qr-overlay-card" onclick={(e) => e.stopPropagation()}>
        <div class="qr-card-header">
          <h3>Scan to Join Table</h3>
          <button class="btn-close-qr" onclick={() => showQR = false}>×</button>
        </div>
        <div class="qr-card-content">
          <canvas bind:this={qrCanvas}></canvas>
          <div class="qr-room-code">ROOM CODE: <span>{syncState.roomCode}</span></div>
          <p>Scan this QR code with a mobile device or tablet to connect to this table immediately.</p>
        </div>
      </div>
    </div>
  {/if}
</div>
