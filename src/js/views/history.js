import { S } from "../state.js";
import { iGet, iDelIdx } from "../db.js";
import { openLightbox, showToast } from "../ui.js";

export async function renderHistory() {
  const cont = document.getElementById('history-content');
  const title = document.getElementById('history-title');
  if (!S.currentDeckId) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🃏</div><div class="empty-state-title">No deck selected</div></div>';
    return;
  }
  const hist = S.history[S.currentDeckId] || [];
  const deck = S.decks.find(d => d.id === S.currentDeckId);
  title.textContent = deck ? `${deck.name} History` : 'Draw History';
  
  if (!hist.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🃏</div><div class="empty-state-title">No cards drawn yet</div><div class="empty-state-sub">Cards you draw will appear here.</div></div>';
    return;
  }
  
  const grid = document.createElement('div');
  grid.className = 'history-grid';
  for (const e of hist) {
    const card = await iGet('cards', e.cardId);
    if (!card) continue;
    const t = document.createElement('div');
    t.className = 'history-card-thumb';
    t.innerHTML = `<img src="${card.front}" alt="" loading="lazy"><span class="thumb-num">p${card.pageNum}</span>`;
    const src = card.front;
    t.onclick = () => window.openLightbox(src);
    grid.appendChild(t);
  }
  cont.innerHTML = '';
  cont.appendChild(grid);
}

export async function clearHistory() {
  if (!S.currentDeckId || !confirm('Clear draw history for this deck?')) return;
  await iDelIdx('history', 'deckId', S.currentDeckId);
  S.history[S.currentDeckId] = [];
  await renderHistory();
  showToast('History cleared');
}

// Bind to window for inline HTML onclick handlers
window.clearHistory = clearHistory;
window.renderHistory = renderHistory;
