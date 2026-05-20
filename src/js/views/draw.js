import { S, STORAGE_KEYS } from "../state.js";
import { iGet, iPut, iIdx } from "../db.js";
import { shuffle, fmtTime } from "../utils.js";
import { showToast, openLightbox } from "../ui.js";
import { renderHistory } from "./history.js";

export async function onDeckChange(id) {
  if (!id) return;
  S.currentDeckId = id;
  S.currentCard = null;
  S.cardFlipped = false;
  localStorage.setItem(STORAGE_KEYS.lastDeckId, id);
  await loadDeckState();
  updateDrawView();
  await renderHistory();
}

export async function loadDeckState() {
  if (!S.currentDeckId) return;
  let ds = await iGet('drawState', S.currentDeckId);
  if (!ds) {
    const cards = await iIdx('cards', 'deckId', S.currentDeckId);
    ds = {
      deckId: S.currentDeckId,
      remaining: shuffle(cards.map(c => c.id)),
      drawn: []
    };
    await iPut('drawState', ds);
  }
  S.drawState[S.currentDeckId] = ds;
  const hist = await iIdx('history', 'deckId', S.currentDeckId);
  hist.sort((a, b) => b.drawnAt - a.drawnAt);
  S.history[S.currentDeckId] = hist;
}

export async function drawCard() {
  if (!S.currentDeckId) return;
  const ds = S.drawState[S.currentDeckId];
  if (!ds || !ds.remaining.length) {
    showToast('Deck exhausted — reshuffle to continue', 'error');
    return;
  }
  const cid = ds.remaining[0];
  ds.remaining = ds.remaining.slice(1);
  ds.drawn.push(cid);
  await iPut('drawState', ds);
  S.currentCard = await iGet('cards', cid);
  S.cardFlipped = false;
  S.showText = false;
  const entry = {
    deckId: S.currentDeckId,
    cardId: cid,
    drawnAt: Date.now()
  };
  await iPut('history', entry);
  const h = S.history[S.currentDeckId] || [];
  h.unshift(entry);
  S.history[S.currentDeckId] = h;
  updateDrawView(true);
  await renderHistory();
}

export async function reshuffleDeck() {
  if (!S.currentDeckId) return;
  const cards = await iIdx('cards', 'deckId', S.currentDeckId);
  const ds = {
    deckId: S.currentDeckId,
    remaining: shuffle(cards.map(c => c.id)),
    drawn: []
  };
  S.drawState[S.currentDeckId] = ds;
  await iPut('drawState', ds);
  S.currentCard = null;
  S.cardFlipped = false;
  S.showText = false;
  updateDrawView();
  showToast('Deck reshuffled');
}

export function updateDrawView(animate = false) {
  const hasDeck = !!S.currentDeckId && S.decks.length > 0;
  const ds = hasDeck ? S.drawState[S.currentDeckId] : null;
  const deck = hasDeck ? S.decks.find(d => d.id === S.currentDeckId) : null;
  
  document.getElementById('draw-btn').disabled = !hasDeck || !ds || !ds.remaining.length;
  document.getElementById('reshuffle-btn').disabled = !hasDeck;
  document.getElementById('text-btn').disabled = !S.currentCard;
  
  if (ds && deck) {
    const pct = deck.cardCount > 0 ? (ds.drawn.length / deck.cardCount * 100) : 0;
    document.getElementById('deck-progress-fill').style.width = pct + '%';
    document.getElementById('progress-drawn').textContent = ds.drawn.length + ' drawn';
    document.getElementById('progress-total').textContent = deck.cardCount + ' total';
    document.getElementById('deck-count-badge').textContent = ds.remaining.length + ' left';
  } else {
    document.getElementById('deck-progress-fill').style.width = '0%';
    document.getElementById('progress-drawn').textContent = '0 drawn';
    document.getElementById('progress-total').textContent = '0 total';
    document.getElementById('deck-count-badge').textContent = '0 left';
  }
  
  const front = document.getElementById('card-face-front');
  const back = document.getElementById('card-face-back');
  const frame = document.getElementById('card-frame');
  const textPanel = document.getElementById('card-text-panel');
  const meta = document.getElementById('card-meta');
  const flipHint = document.getElementById('flip-hint');
  
  if (!S.currentCard) {
    front.innerHTML = '<div class="card-empty"><div class="card-empty-symbol">✦</div><div class="card-empty-text">No card drawn</div></div>';
    back.innerHTML = '';
    frame.classList.remove('flippable', 'flipped');
    textPanel.classList.remove('visible');
    meta.style.display = 'none';
    flipHint.style.display = 'none';
    return;
  }
  
  const card = S.currentCard;
  const hasBoth = !!(card.front && card.back);
  
  front.innerHTML = `<img src="${card.front}" alt="" onclick="event.stopPropagation(); window.openLightbox('${card.front}')">`;
  
  if (hasBoth) {
    back.innerHTML = `<img src="${card.back}" alt="" onclick="event.stopPropagation(); window.openLightbox('${card.back}')">`;
    frame.classList.add('flippable');
    flipHint.style.display = 'block';
  } else {
    back.innerHTML = '';
    frame.classList.remove('flippable');
    flipHint.style.display = 'none';
  }
  
  if (S.cardFlipped) {
    frame.classList.add('flipped');
  } else {
    frame.classList.remove('flipped');
  }
  
  if (S.showText && card.text) {
    textPanel.textContent = card.text;
    textPanel.classList.add('visible');
  } else {
    textPanel.classList.remove('visible');
  }
  
  meta.style.display = 'flex';
  document.getElementById('card-num-display').textContent = `Page ${card.pageNum}`;
  
  const h = S.history[S.currentDeckId];
  if (h && h.length) {
    document.getElementById('card-drawn-time').textContent = fmtTime(h[0].drawnAt);
  }
  
  if (animate) {
    frame.classList.remove('revealing');
    void frame.offsetWidth;
    frame.classList.add('revealing');
    setTimeout(() => frame.classList.remove('revealing'), 400);
  }
}

export function handleCardClick() {
  if (!S.currentCard || !(S.currentCard.front && S.currentCard.back)) return;
  S.cardFlipped = !S.cardFlipped;
  const frame = document.getElementById('card-frame');
  if (S.cardFlipped) {
    frame.classList.add('flipped');
  } else {
    frame.classList.remove('flipped');
  }
}

export function toggleCardText() {
  if (!S.currentCard) return;
  S.showText = !S.showText;
  updateDrawView();
}

// Attach listeners to window for inline HTML onclick handlers
window.onDeckChange = onDeckChange;
window.drawCard = drawCard;
window.reshuffleDeck = reshuffleDeck;
window.handleCardClick = handleCardClick;
window.toggleCardText = toggleCardText;
