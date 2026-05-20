import { S, STORAGE_KEYS } from "../state.js";
import { iDel, iDelIdx } from "../db.js";
import { esc, fmtDate } from "../utils.js";
import { showToast } from "../ui.js";
import { onDeckChange, loadDeckState, updateDrawView } from "./draw.js";
import { renderHistory } from "./history.js";

export function renderDeckSelect() {
  const sel = document.getElementById('deck-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (!S.decks.length) {
    sel.innerHTML = '<option value="">— No decks imported —</option>';
    return;
  }
  S.decks.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    if (d.id === S.currentDeckId) o.selected = true;
    sel.appendChild(o);
  });
}

export function renderLibrary() {
  const cont = document.getElementById('library-content');
  if (!cont) return;
  if (!S.decks.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-title">No decks imported</div><div class="empty-state-sub">Import a Monte Cook Games card deck PDF to get started.</div></div>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'deck-list';
  S.decks.forEach(deck => {
    const el = document.createElement('div');
    el.className = 'deck-item' + (deck.id === S.currentDeckId ? ' current' : '');
    el.innerHTML = `
      <div class="deck-item-preview">${deck.previewImage ? `<img src="${deck.previewImage}" alt="">` : ''}</div>
      <div class="deck-item-info">
        <div class="deck-item-name">${esc(deck.name)}</div>
        <div class="deck-item-meta">${deck.cardCount} cards · ${fmtDate(deck.createdAt)}</div>
      </div>
      <div class="deck-item-actions">
        <button class="btn btn-ghost" onclick="selectDeckLib('${deck.id}')">Use</button>
        <button class="btn btn-blue btn-ghost" onclick="window.openSplitModal('${deck.id}')">⌗ Split</button>
        <button class="btn btn-danger btn-ghost" onclick="deleteDeck('${deck.id}')">✕</button>
      </div>
    `;
    list.appendChild(el);
  });
  cont.innerHTML = '';
  cont.appendChild(list);
}

export function selectDeckLib(id) {
  const sel = document.getElementById('deck-select');
  if (sel) sel.value = id;
  onDeckChange(id);
  
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.trim() === 'Draw');
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === 'view-draw');
  });
}

export async function deleteDeck(id) {
  const deck = S.decks.find(d => d.id === id);
  if (!deck) return;
  if (!confirm(`Delete "${deck.name}" and all its cards?`)) return;
  
  await iDel('decks', id);
  await iDelIdx('cards', 'deckId', id);
  await iDelIdx('history', 'deckId', id);
  await iDel('drawState', id);
  
  S.decks = S.decks.filter(d => d.id !== id);
  delete S.drawState[id];
  delete S.history[id];
  
  if (S.currentDeckId === id) {
    S.currentDeckId = S.decks.length ? S.decks[0].id : null;
    S.currentCard = null;
    localStorage.setItem(STORAGE_KEYS.lastDeckId, S.currentDeckId || '');
  }
  
  renderDeckSelect();
  renderLibrary();
  await loadDeckState();
  updateDrawView();
  await renderHistory();
  showToast('Deck deleted');
}

// Bind to window for inline HTML onclick handlers
window.renderDeckSelect = renderDeckSelect;
window.renderLibrary = renderLibrary;
window.selectDeckLib = selectDeckLib;
window.deleteDeck = deleteDeck;
