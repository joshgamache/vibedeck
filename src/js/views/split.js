import { S } from "../state.js";
import { iIdx, iBulkPut, iPut, iDel, iDelIdx } from "../db.js";
import { shuffle, esc } from "../utils.js";
import { showToast } from "../ui.js";
import { renderDeckSelect, renderLibrary } from "./library.js";
import { loadDeckState, updateDrawView } from "./draw.js";
import { renderHistory } from "./history.js";

let splitDeckId = null;
let splitCards = [];
let splitRanges = [];

const RCOLORS = ['#d4943a', '#7aabee', '#9b7fd4', '#5db87f', '#e07070', '#c4a840', '#6bccc4', '#e09060'];

export async function openSplitModal(deckId) {
  splitDeckId = deckId;
  splitRanges = [];
  splitCards = [];
  
  const deck = S.decks.find(d => d.id === deckId);
  document.getElementById('split-deck-name').textContent = deck ? deck.name : '';
  document.getElementById('split-ranges-list').innerHTML = '<div class="no-ranges">No ranges yet — add a range and assign page numbers.</div>';
  document.getElementById('split-confirm-btn').disabled = true;
  document.getElementById('split-modal').classList.add('open');
  
  const grid = document.getElementById('split-card-grid');
  grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:20px 0"><div class="empty-state-icon" style="font-size:1.5rem">⏳</div><div class="empty-state-title">Loading…</div></div>';
  
  splitCards = await iIdx('cards', 'deckId', deckId);
  splitCards.sort((a, b) => a.pageNum - b.pageNum);
  document.getElementById('split-total').textContent = `(${splitCards.length})`;
  
  renderSplitGrid();
}

export function closeSplitModal() {
  document.getElementById('split-modal').classList.remove('open');
  splitDeckId = null;
  splitCards = [];
  splitRanges = [];
}

export function rangeForPage(pnum) {
  return splitRanges.find(r => {
    const s = parseInt(r.start) || 0;
    const e = parseInt(r.end) || 0;
    return s > 0 && e >= s && pnum >= s && pnum <= e;
  }) || null;
}

export function renderSplitGrid() {
  const grid = document.getElementById('split-card-grid');
  grid.innerHTML = '';
  
  splitCards.forEach(card => {
    const r = rangeForPage(card.pageNum);
    const div = document.createElement('div');
    div.className = 'split-card-thumb';
    if (r) div.style.borderColor = r.color;
    
    div.innerHTML = `
      <img src="${card.front}" alt="" loading="lazy">
      <div class="sc-bar" style="background:${r ? r.color : 'transparent'}"></div>
      <span class="sc-num">p${card.pageNum}</span>
    `;
    const src = card.front;
    div.onclick = () => window.openLightbox(src);
    grid.appendChild(div);
  });
}

export function addSplitRange() {
  const color = RCOLORS[splitRanges.length % RCOLORS.length];
  splitRanges.push({
    id: 'r' + Date.now(),
    name: '',
    start: '',
    end: '',
    color
  });
  renderSplitRanges();
}

export function renderSplitRanges() {
  const list = document.getElementById('split-ranges-list');
  if (!splitRanges.length) {
    list.innerHTML = '<div class="no-ranges">No ranges yet — add a range and assign page numbers.</div>';
    document.getElementById('split-confirm-btn').disabled = true;
    return;
  }
  
  list.innerHTML = '';
  splitRanges.forEach((r, idx) => {
    const s = parseInt(r.start) || 0;
    const e = parseInt(r.end) || 0;
    const cnt = splitCards.filter(c => s > 0 && e >= s && c.pageNum >= s && c.pageNum <= e).length;
    
    const div = document.createElement('div');
    div.className = 'range-item';
    div.innerHTML = `
      <div class="range-header">
        <div class="range-color-dot" style="background:${r.color}"></div>
        <input class="range-name-input" placeholder="Name this sub-deck (e.g. Illustrations)" value="${esc(r.name)}" oninput="window.updateRangeName(${idx}, this.value)">
        <button class="range-del-btn" onclick="window.delRange('${r.id}')">✕</button>
      </div>
      <div class="range-fields">
        <div class="range-field">
          <div class="range-field-label">From page</div>
          <input type="number" class="range-num-input" min="1" placeholder="1" value="${r.start}" oninput="window.updateRangeStart(${idx}, this.value)">
        </div>
        <div class="range-sep">–</div>
        <div class="range-field">
          <div class="range-field-label">To page</div>
          <input type="number" class="range-num-input" min="1" placeholder="${splitCards.length || '?'}" value="${r.end}" oninput="window.updateRangeEnd(${idx}, this.value)">
        </div>
      </div>
      <div class="range-card-count">${cnt > 0 ? `${cnt} card${cnt !== 1 ? 's' : ''} in this range` : 'Enter a page range above'}</div>
    `;
    list.appendChild(div);
  });
  validateSplit();
}

export function updateRangeName(idx, val) {
  splitRanges[idx].name = val;
  validateSplit();
}

export function updateRangeStart(idx, val) {
  splitRanges[idx].start = val;
  onRangeChange();
}

export function updateRangeEnd(idx, val) {
  splitRanges[idx].end = val;
  onRangeChange();
}

export function delRange(id) {
  splitRanges = splitRanges.filter(r => r.id !== id);
  renderSplitRanges();
  renderSplitGrid();
}

export function onRangeChange() {
  renderSplitRanges();
  renderSplitGrid();
}

export function validateSplit() {
  const ok = splitRanges.length > 0 && splitRanges.every(r => r.name.trim() && parseInt(r.start) > 0 && parseInt(r.end) >= parseInt(r.start));
  document.getElementById('split-confirm-btn').disabled = !ok;
}

export async function confirmSplit() {
  const after = document.querySelector('input[name="split-after"]:checked').value;
  const newDecks = [];
  
  for (const r of splitRanges) {
    const s = parseInt(r.start);
    const e = parseInt(r.end);
    const rCards = splitCards.filter(c => c.pageNum >= s && c.pageNum <= e);
    if (!rCards.length) continue;
    
    const nid = 'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const nCards = rCards.map((c, i) => ({
      ...c,
      id: `${nid}_${i}`,
      deckId: nid
    }));
    
    await iBulkPut('cards', nCards);
    const ndeck = {
      id: nid,
      name: r.name,
      cardCount: nCards.length,
      createdAt: Date.now(),
      previewImage: nCards[0]?.front || null
    };
    
    await iPut('decks', ndeck);
    const ds = {
      deckId: nid,
      remaining: shuffle(nCards.map(c => c.id)),
      drawn: []
    };
    
    await iPut('drawState', ds);
    S.drawState[nid] = ds;
    S.decks.push(ndeck);
    S.history[nid] = [];
    newDecks.push(ndeck);
  }
  
  if (after === 'delete') {
    await iDel('decks', splitDeckId);
    await iDelIdx('cards', 'deckId', splitDeckId);
    await iDelIdx('history', 'deckId', splitDeckId);
    await iDel('drawState', splitDeckId);
    
    S.decks = S.decks.filter(d => d.id !== splitDeckId);
    delete S.drawState[splitDeckId];
    delete S.history[splitDeckId];
    
    if (S.currentDeckId === splitDeckId) {
      S.currentDeckId = newDecks.length ? newDecks[0].id : (S.decks.length ? S.decks[0].id : null);
      S.currentCard = null;
      localStorage.setItem('lastDeckId', S.currentDeckId || '');
    }
  }
  
  if (newDecks.length && after !== 'delete') {
    S.currentDeckId = newDecks[0].id;
    localStorage.setItem('lastDeckId', newDecks[0].id);
  }
  
  closeSplitModal();
  renderDeckSelect();
  renderLibrary();
  await loadDeckState();
  updateDrawView();
  await renderHistory();
  showToast(`Created ${newDecks.length} sub-deck${newDecks.length !== 1 ? 's' : ''}!`, 'success');
}

// Bind to window for inline HTML onclick handlers
window.openSplitModal = openSplitModal;
window.closeSplitModal = closeSplitModal;
window.addSplitRange = addSplitRange;
window.delRange = delRange;
window.updateRangeName = updateRangeName;
window.updateRangeStart = updateRangeStart;
window.updateRangeEnd = updateRangeEnd;
window.confirmSplit = confirmSplit;
