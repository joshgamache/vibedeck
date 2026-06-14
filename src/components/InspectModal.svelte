<script lang="ts">
  import { syncState, discardVirtualCard } from "../js/sync.svelte";
  import { appState } from "../js/state.svelte";

  // Bindable properties
  let { inspectingPlayerId = $bindable() } = $props();

  let virtualCardFlips = $state<Record<string, boolean>>({}); // Dictionary of cardId -> boolean

  const targetPlayer = $derived(syncState.connectedPlayers.find(p => p.peerId === inspectingPlayerId));
  const targetHand = $derived(inspectingPlayerId ? (syncState.virtualPlayerHands[inspectingPlayerId] || []) : []);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="discard-modal-overlay" onclick={() => inspectingPlayerId = null}>
  <div class="discard-modal" onclick={(e) => e.stopPropagation()}>
    <div class="discard-modal-header">
      <h3>🤖 {targetPlayer ? targetPlayer.name : "Virtual Player"}'s Hand ({targetHand.length})</h3>
      <button class="btn-close-modal" onclick={() => inspectingPlayerId = null}>×</button>
    </div>

    <div class="discard-modal-content">
      {#if targetHand.length === 0}
        <p class="empty-pile-text">This player's hand is currently empty.</p>
      {:else}
        <div class="discard-grid">
          {#each targetHand as card (card.id)}
            <div class="discard-item">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <img
                src={virtualCardFlips[card.id] ? card.back : card.front}
                alt=""
                onclick={() => appState.lightboxSrc = virtualCardFlips[card.id] ? card.back! : card.front}
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
                    onclick={() => virtualCardFlips[card.id] = !virtualCardFlips[card.id]}
                  >
                    🔄 {virtualCardFlips[card.id] ? "Front" : "Back"}
                  </button>
                {/if}
                <button
                  class="btn btn-danger btn-xs"
                  style="padding: 4px 6px;"
                  onclick={() => inspectingPlayerId && discardVirtualCard(inspectingPlayerId, card)}
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

<style>
  .discard-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(4px);
  }
  .discard-modal {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 100%;
    max-width: 680px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  }
  .discard-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .discard-modal-header h3 {
    font-family: "Cinzel", serif;
    font-size: 0.95rem;
    color: var(--amber);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .btn-close-modal {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
  }
  .btn-close-modal:hover {
    color: var(--text);
  }
  .discard-modal-content {
    padding: 20px;
    overflow-y: auto;
    flex-grow: 1;
  }
  .empty-pile-text {
    color: var(--text-muted);
    text-align: center;
    font-style: italic;
    padding: 40px 0;
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
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .discard-item img {
    width: 100%;
    aspect-ratio: 2.5/3.5;
    object-fit: cover;
    border-radius: 6px;
    cursor: pointer;
  }
  .discard-item-info {
    font-family: "Crimson Pro", serif;
    font-size: 0.85rem;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    gap: 4px;
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
  .virtual-card-actions {
    display: flex;
    gap: 6px;
    width: 100%;
    margin-top: auto;
  }
  .btn.btn-xs {
    padding: 4px 8px;
    font-size: 0.65rem;
    border-radius: 4px;
    min-height: auto;
  }
</style>
