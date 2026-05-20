import { initDB, iAll } from "./db.js";
import { S, STORAGE_KEYS } from "./state.js";
import { closeLightbox } from "./ui.js";

// Import view controllers to trigger their side-effects and register window handlers
import { loadDeckState, updateDrawView } from "./views/draw.js";
import { renderHistory } from "./views/history.js";
import { renderDeckSelect, renderLibrary } from "./views/library.js";
import { closeImportModal, handleFileDrop } from "./views/import.js";
import { closeSplitModal } from "./views/split.js";

export function switchTab(tab, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  
  const targetView = document.getElementById('view-' + tab);
  if (targetView) targetView.classList.add('active');
  if (el) el.classList.add('active');
}

async function init() {
  // Set up PDF.js CDN worker source path
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  
  // Database & state initialization
  await initDB();
  S.decks = await iAll('decks');
  
  const ds = await iAll('drawState');
  ds.forEach(d => {
    S.drawState[d.deckId] = d;
  });
  
  const last = localStorage.getItem(STORAGE_KEYS.lastDeckId);
  if (last && S.decks.find(d => d.id === last)) {
    S.currentDeckId = last;
  } else if (S.decks.length) {
    S.currentDeckId = S.decks[0].id;
  }
  
  renderDeckSelect();
  renderLibrary();
  await loadDeckState();
  updateDrawView();
  await renderHistory();
  
  // Event delegation & modal close click binding
  const importModal = document.getElementById('import-modal');
  if (importModal) {
    importModal.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeImportModal();
    });
  }
  
  const splitModal = document.getElementById('split-modal');
  if (splitModal) {
    splitModal.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeSplitModal();
    });
  }
  
  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.classList.add('drag-over');
    });
    
    dz.addEventListener('dragleave', () => {
      dz.classList.remove('drag-over');
    });
    
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      handleFileDrop(e);
    });
  }
}

// Bind to window context
window.switchTab = switchTab;
window.closeLightbox = closeLightbox;

// Bootstrap Application on content load
document.addEventListener('DOMContentLoaded', init);
export { init };
