import { S, STORAGE_KEYS } from "../state.js";
import { iBulkPut, iPut } from "../db.js";
import { shuffle } from "../utils.js";
import { showToast } from "../ui.js";
import { renderDeckSelect, renderLibrary } from "./library.js";
import { loadDeckState, updateDrawView } from "./draw.js";
import { renderHistory } from "./history.js";

let impFile = null;
let impLayout = 'single';
let impStep = 1;
let prevPages = [];

export function openImportModal() {
  impFile = null;
  impLayout = 'single';
  impStep = 1;
  prevPages = [];
  
  document.getElementById('import-name').value = '';
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('drop-zone-text').textContent = 'Tap to choose PDF';
  document.getElementById('preview-grid').innerHTML = '';
  document.getElementById('preview-loading').style.display = 'none';
  document.getElementById('preview-content').style.display = 'none';
  
  document.querySelectorAll('.layout-option').forEach(l => l.classList.remove('selected'));
  document.getElementById('lo-single').classList.add('selected');
  document.getElementById('ibtn-next').style.display = '';
  
  goStep(1);
  document.getElementById('import-modal').classList.add('open');
}

export function closeImportModal() {
  document.getElementById('import-modal').classList.remove('open');
}

export function goStep(n) {
  impStep = n;
  document.querySelectorAll('.import-step').forEach((el, i) => el.classList.toggle('active', i + 1 === n));
  document.querySelectorAll('.step-dot').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
    el.classList.toggle('done', i + 1 < n);
  });
  
  const nb = document.getElementById('ibtn-next');
  const bb = document.getElementById('ibtn-back');
  const cb = document.getElementById('ibtn-cancel');
  
  nb.style.display = '';
  if (n === 1) {
    bb.style.display = 'none';
    cb.style.display = '';
    nb.textContent = 'Preview →';
    nb.onclick = importNext;
    nb.disabled = !(impFile && document.getElementById('import-name').value.trim());
  } else if (n === 2) {
    bb.style.display = '';
    cb.style.display = 'none';
    nb.textContent = 'Import Deck →';
    nb.onclick = startImport;
    nb.disabled = false;
  } else {
    bb.style.display = 'none';
    cb.style.display = 'none';
    nb.style.display = 'none';
  }
}

export function checkStep1() {
  document.getElementById('ibtn-next').disabled = !(impFile && document.getElementById('import-name').value.trim());
}

export function setLayout(val, el) {
  impLayout = val;
  document.querySelectorAll('.layout-option').forEach(l => l.classList.remove('selected'));
  el.classList.add('selected');
  if (prevPages.length) renderPrevGrid();
}

export function onFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  impFile = f;
  document.getElementById('drop-zone-text').textContent = f.name;
  
  const ni = document.getElementById('import-name');
  if (!ni.value) {
    ni.value = f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }
  checkStep1();
}

export async function importNext() {
  if (!impFile) return;
  goStep(2);
  document.getElementById('preview-loading').style.display = 'block';
  document.getElementById('preview-content').style.display = 'none';
  prevPages = [];
  
  try {
    const ab = await impFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
    const total = pdf.numPages;
    
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.6 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      let text = '';
      try {
        const tc = await page.getTextContent();
        text = tc.items.map(x => x.str).join(' ').trim();
      } catch (e) {
        // Fallback if text extraction fails
      }
      
      prevPages.push({
        img: canvas.toDataURL('image/jpeg', 0.75),
        text,
        pageNum: i
      });
      document.getElementById('mini-pf').style.width = (i / total * 100) + '%';
    }
    
    document.getElementById('preview-loading').style.display = 'none';
    document.getElementById('preview-content').style.display = 'block';
    renderPrevGrid();
  } catch (err) {
    showToast('Failed to read PDF: ' + err.message, 'error');
    goStep(1);
  }
}

export function importBack() {
  if (impStep === 2) goStep(1);
}

export function renderPrevGrid() {
  const grid = document.getElementById('preview-grid');
  const info = document.getElementById('preview-info-text');
  const pex = document.getElementById('pair-example');
  grid.innerHTML = '';
  
  if (impLayout === 'single') {
    pex.style.display = 'none';
    info.textContent = `${prevPages.length} pages → ${prevPages.length} single-sided cards.`;
    prevPages.forEach(p => {
      const d = document.createElement('div');
      d.className = 'preview-thumb';
      d.innerHTML = `<img src="${p.img}" loading="lazy"><span class="pt-num">p${p.pageNum}</span>`;
      grid.appendChild(d);
    });
  } else {
    const isAF = impLayout === 'paired-af';
    const cardCount = Math.ceil(prevPages.length / 2);
    pex.style.display = 'flex';
    
    const p0 = prevPages[0];
    const p1 = prevPages[1];
    const frontP = isAF ? p0 : p1;
    const backP = isAF ? p1 : p0;
    
    document.getElementById('ex-front-img').src = frontP ? frontP.img : '';
    document.getElementById('ex-back-img').src = backP ? backP.img : '';
    document.getElementById('pex-title').textContent = isAF ? 'Layout A: Odd=Front, Even=Back' : 'Layout B: Odd=Back, Even=Front';
    document.getElementById('pex-sub').textContent = isAF ? 'Page 1→Front, Page 2→Back, Page 3→Front…' : 'Page 1→Back, Page 2→Front, Page 3→Back…';
    
    info.textContent = `${prevPages.length} pages → ${cardCount} cards with front & back faces.`;
    
    prevPages.forEach((p, i) => {
      const isOdd = (i % 2 === 0);
      let role = isAF ? (isOdd ? 'front' : 'back') : (isOdd ? 'back' : 'front');
      const pairN = Math.floor(i / 2) + 1;
      
      const d = document.createElement('div');
      d.className = `preview-thumb pt-${role}`;
      d.innerHTML = `<img src="${p.img}" loading="lazy"><span class="pt-pair-num">Card ${pairN}</span><span class="pt-num">p${p.pageNum}</span><span class="pt-role-badge">${role}</span>`;
      grid.appendChild(d);
    });
  }
}

export async function startImport() {
  if (!impFile) return;
  const name = document.getElementById('import-name').value.trim();
  if (!name) return;
  const quality = parseFloat(document.getElementById('import-quality').value);
  
  goStep(3);
  setImpProg(0, 'Reading PDF…');
  
  try {
    const ab = await impFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
    const total = pdf.numPages;
    const pages = [];
    
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: quality });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      let text = '';
      try {
        const tc = await page.getTextContent();
        text = tc.items.map(x => x.str).join(' ').trim();
      } catch (e) {
        // Fallback text extraction
      }
      
      pages.push({
        img: canvas.toDataURL('image/jpeg', 0.88),
        text,
        pageNum: i
      });
      setImpProg(5 + (i / total) * 80, `Rendering page ${i} of ${total}…`);
    }
    
    setImpProg(88, 'Building cards…');
    const deckId = 'deck_' + Date.now();
    const cards = [];
    
    if (impLayout === 'single') {
      pages.forEach((p, i) => cards.push({
        id: `${deckId}_${i}`,
        deckId,
        pageNum: p.pageNum,
        front: p.img,
        back: null,
        text: p.text
      }));
    } else {
      const isAF = impLayout === 'paired-af';
      for (let i = 0; i < pages.length; i += 2) {
        const p0 = pages[i];
        const p1 = pages[i + 1] || null;
        const frontP = isAF ? p0 : p1;
        const backP = isAF ? p1 : p0;
        
        cards.push({
          id: `${deckId}_${i}`,
          deckId,
          pageNum: p0.pageNum,
          front: frontP ? frontP.img : null,
          back: backP ? backP.img : null,
          text: (p0.text || '') + ' ' + (p1 ? p1.text : '')
        });
      }
    }
    
    setImpProg(92, 'Saving to storage…');
    await iBulkPut('cards', cards);
    
    const deck = {
      id: deckId,
      name,
      cardCount: cards.length,
      createdAt: Date.now(),
      previewImage: cards[0]?.front || null
    };
    await iPut('decks', deck);
    
    const ds = {
      deckId,
      remaining: shuffle(cards.map(c => c.id)),
      drawn: []
    };
    await iPut('drawState', ds);
    
    S.drawState[deckId] = ds;
    S.decks.push(deck);
    S.currentDeckId = deckId;
    localStorage.setItem(STORAGE_KEYS.lastDeckId, deckId);
    S.history[deckId] = [];
    
    setImpProg(100, 'Done!');
    setTimeout(async () => {
      closeImportModal();
      renderDeckSelect();
      document.getElementById('deck-select').value = deckId;
      renderLibrary();
      await loadDeckState();
      updateDrawView();
      await renderHistory();
      showToast(`${deck.name} imported — ${cards.length} cards`, 'success');
    }, 500);
  } catch (err) {
    console.error(err);
    showToast('Import failed: ' + err.message, 'error');
    goStep(2);
  }
}

export function setImpProg(pct, text) {
  document.getElementById('imp-pf').style.width = pct + '%';
  document.getElementById('imp-pt').textContent = text;
}

export function handleFileDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    impFile = f;
    document.getElementById('drop-zone-text').textContent = f.name;
    const ni = document.getElementById('import-name');
    if (!ni.value) {
      ni.value = f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    }
    checkStep1();
  }
}

// Bind to window for inline HTML onclick handlers and file input events
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.checkStep1 = checkStep1;
window.setLayout = setLayout;
window.onFileSelected = onFileSelected;
window.importNext = importNext;
window.importBack = importBack;
window.startImport = startImport;
window.handleFileDrop = handleFileDrop;
