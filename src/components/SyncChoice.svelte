<script lang="ts">
  import { syncState, startHosting, joinTable } from "../js/sync.svelte";

  let inputCode = $state("");

  function handleJoin() {
    if (inputCode.trim().length === 6 && syncState.playerName.trim()) {
      joinTable(inputCode.trim(), syncState.playerName.trim());
    }
  }
</script>

<div class="sync-choice-container">
  <h2 class="sync-title">Table Sync</h2>
  <p class="sync-subtitle">Share card draws across devices at your table in real time.</p>

  <div class="choice-cards">
    <!-- HOST CARD -->
    <div class="choice-card host-card">
      <div class="choice-icon">📢</div>
      <h3>Host Table (GM)</h3>
      <p>Create a game room. Broadcast drawn cards to everyone, or distribute them privately to specific players.</p>
      <button class="btn btn-primary" onclick={startHosting}>Host Room</button>
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
          bind:value={syncState.playerName} 
          style="letter-spacing: normal; font-family: 'Crimson Pro', serif; font-size: 1.05rem; margin-bottom: 4px;"
        />
        <input 
          type="text" 
          placeholder="6-digit Room Code" 
          maxlength="6" 
          bind:value={inputCode} 
          onkeydown={(e) => e.key === "Enter" && handleJoin()}
        />
        <button class="btn btn-secondary" onclick={handleJoin} disabled={inputCode.length !== 6 || !syncState.playerName.trim()}>
          Connect
        </button>
      </div>
    </div>
  </div>
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
</style>
