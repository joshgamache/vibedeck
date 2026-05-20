<script>
  import { importModalOpen, decks, currentDeckId, drawState, history, STORAGE_KEYS } from '../js/state.js';
  import { iBulkPut, iPut } from '../js/db.js';
  import { shuffle } from '../js/utils.js';
  import { showToast } from '../js/toastStore.js';

  let impFile = null;
  let impName = '';
  let impLayout = 'single';
  let impQuality = 2.0;
  let impStep = 1;
  let prevPages = [];

  let previewLoading = false;
  let previewLoadingProgress = 0;
  let previewContentVisible = false;

  let importProgress = 0;
  let importProgressText = '';
  let isDragOver = false;

  let fileInputEl;

  $: isNextDisabled = !(impFile && impName.trim());
  $: p0 = prevPages[0];
  $: p1 = prevPages[1];
  $: isAF = impLayout === 'paired-af';
  $: frontP = isAF ? p0 : p1;
  $: backP = isAF ? p1 : p0;
  $: cardCount = Math.ceil(prevPages.length / 2);

  // Reset modal state when it's closed/opened
  $: {
    if (!$importModalOpen) {
      impFile = null;
      impName = '';
      impLayout = 'single';
      impQuality = 2.0;
      impStep = 1;
      prevPages = [];
      previewLoading = false;
      previewLoadingProgress = 0;
      previewContentVisible = false;
      importProgress = 0;
      importProgressText = '';
      isDragOver = false;
    }
  }

  function onFileSelected(e) {
    const f = e.target.files[0];
    if (!f) return;
    impFile = f;
    if (!impName) {
      impName = f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragOver = false;
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') {
      impFile = f;
      if (!impName) {
        impName = f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      }
    }
  }

  async function importNext() {
    if (!impFile) return;
    impStep = 2;
    previewLoading = true;
    previewContentVisible = false;
    prevPages = [];
    previewLoadingProgress = 0;

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
          // fallback
        }

        prevPages.push({
          img: canvas.toDataURL('image/jpeg', 0.75),
          text,
          pageNum: i
        });
        prevPages = prevPages;
        previewLoadingProgress = (i / total) * 100;
      }

      previewLoading = false;
      previewContentVisible = true;
    } catch (err) {
      showToast('Failed to read PDF: ' + err.message, 'error');
      impStep = 1;
    }
  }

  async function startImport() {
    if (!impFile) return;
    if (!impName.trim()) return;

    impStep = 3;
    importProgress = 0;
    importProgressText = 'Reading PDF…';

    try {
      const ab = await impFile.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
      const total = pdf.numPages;
      const pages = [];

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: impQuality });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        let text = '';
        try {
          const tc = await page.getTextContent();
          text = tc.items.map(x => x.str).join(' ').trim();
        } catch (e) {
          // fallback
        }

        pages.push({
          img: canvas.toDataURL('image/jpeg', 0.88),
          text,
          pageNum: i
        });
        importProgress = 5 + (i / total) * 80;
        importProgressText = `Rendering page ${i} of ${total}…`;
      }

      importProgress = 88;
      importProgressText = 'Building cards…';
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
        const isLayoutAF = impLayout === 'paired-af';
        for (let i = 0; i < pages.length; i += 2) {
          const p0_page = pages[i];
          const p1_page = pages[i + 1] || null;
          const frontPage = isLayoutAF ? p0_page : p1_page;
          const backPage = isLayoutAF ? p1_page : p0_page;

          cards.push({
            id: `${deckId}_${i}`,
            deckId,
            pageNum: p0_page.pageNum,
            front: frontPage ? frontPage.img : null,
            back: backPage ? backPage.img : null,
            text: (p0_page.text || '') + ' ' + (p1_page ? p1_page.text : '')
          });
        }
      }

      importProgress = 92;
      importProgressText = 'Saving to storage…';
      await iBulkPut('cards', cards);

      const deck = {
        id: deckId,
        name: impName,
        cardCount: cards.length,
        createdAt: Date.now(),
        previewImage: cards[0]?.front || null
      };
      await iPut('decks', deck);

      const dsVal = {
        deckId,
        remaining: shuffle(cards.map(c => c.id)),
        drawn: []
      };
      await iPut('drawState', dsVal);

      // Update global states
      drawState.update(store => {
        store[deckId] = dsVal;
        return store;
      });
      decks.update(list => [...list, deck]);
      currentDeckId.set(deckId);
      localStorage.setItem(STORAGE_KEYS.lastDeckId, deckId);
      history.update(store => {
        store[deckId] = [];
        return store;
      });

      importProgress = 100;
      importProgressText = 'Done!';

      setTimeout(() => {
        importModalOpen.set(false);
        showToast(`${deck.name} imported — ${cards.length} cards`, 'success');
      }, 500);
    } catch (err) {
      console.error(err);
      showToast('Import failed: ' + err.message, 'error');
      impStep = 2;
    }
  }

  function triggerFileChoose() {
    fileInputEl.click();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" class:open={$importModalOpen} on:click|self={() => importModalOpen.set(false)}>
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">
        Import Deck
        <button class="modal-close" on:click={() => importModalOpen.set(false)}>✕</button>
      </div>
      <div class="stepper">
        <div class="step-dot" class:active={impStep === 1} class:done={impStep > 1}>
          <div class="step-circle">1</div>
          <div class="step-label">Configure</div>
        </div>
        <div class="step-dot" class:active={impStep === 2} class:done={impStep > 2}>
          <div class="step-circle">2</div>
          <div class="step-label">Preview</div>
        </div>
        <div class="step-dot" class:active={impStep === 3} class:done={impStep > 3}>
          <div class="step-circle">3</div>
          <div class="step-label">Import</div>
        </div>
      </div>
    </div>

    <div class="modal-body">
      <!-- Step 1: Configure -->
      {#if impStep === 1}
        <div class="import-step active">
          <div class="form-group">
            <label class="form-label">Deck Name</label>
            <input type="text" class="form-input" bind:value={impName} placeholder="e.g. Cypher Deck, Weird Deck…" />
          </div>

          <div class="form-group">
            <label class="form-label">PDF File</label>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div
              class="drop-zone"
              class:drag-over={isDragOver}
              on:dragover={handleDragOver}
              on:dragleave={handleDragLeave}
              on:drop={handleDrop}
              on:click={triggerFileChoose}
            >
              <input type="file" accept=".pdf" style="display:none" bind:this={fileInputEl} on:change={onFileSelected} />
              <div class="drop-zone-icon">📄</div>
              <div class="drop-zone-text">
                {impFile ? impFile.name : 'Tap to choose PDF'}
              </div>
              <div class="drop-zone-sub">or drag &amp; drop</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Card Layout</label>
            <div class="layout-grid">
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="layout-option"
                class:selected={impLayout === 'single'}
                on:click={() => impLayout = 'single'}
              >
                <div class="layout-option-icon">🃏</div>
                <div class="layout-option-title">Single</div>
                <div class="layout-option-sub">1 page = 1 card, no back face</div>
              </div>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="layout-option"
                class:selected={impLayout === 'paired-af'}
                on:click={() => impLayout = 'paired-af'}
              >
                <div class="layout-option-icon">↕</div>
                <div class="layout-option-title">Paired A</div>
                <div class="layout-option-sub">Odd pages = Front, Even pages = Back</div>
              </div>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="layout-option"
                class:selected={impLayout === 'paired-bf'}
                on:click={() => impLayout = 'paired-bf'}
              >
                <div class="layout-option-icon">↕</div>
                <div class="layout-option-title">Paired B</div>
                <div class="layout-option-sub">Odd pages = Back, Even pages = Front</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Render Quality</label>
            <select class="form-input" bind:value={impQuality}>
              <option value={1.5}>Standard (faster)</option>
              <option value={2.0}>High (recommended)</option>
              <option value={2.5}>Maximum (large files)</option>
            </select>
          </div>
        </div>
      {/if}

      <!-- Step 2: Preview -->
      {#if impStep === 2}
        <div class="import-step active">
          {#if previewLoading}
            <div>
              <div class="preview-loading">
                <div class="preview-loading-icon">⏳</div>
                <div class="preview-loading-text">Rendering preview pages…</div>
                <div class="mini-progress">
                  <div class="mini-progress-fill" style="width: {previewLoadingProgress}%"></div>
                </div>
              </div>
            </div>
          {/if}

          {#if previewContentVisible}
            <div>
              {#if impLayout !== 'single'}
                <div class="pair-example">
                  <div class="pair-ex-col is-front">
                    <div class="ex-label">Front</div>
                    <div class="ex-thumb">
                      {#if frontP}
                        <img src={frontP.img} alt="" />
                      {/if}
                    </div>
                  </div>
                  <div class="pair-ex-arrow">⟷</div>
                  <div class="pair-ex-col is-back">
                    <div class="ex-label">Back</div>
                    <div class="ex-thumb">
                      {#if backP}
                        <img src={backP.img} alt="" />
                      {/if}
                    </div>
                  </div>
                  <div class="pair-ex-info">
                    <div class="pair-ex-title">
                      {isAF ? 'Layout A: Odd=Front, Even=Back' : 'Layout B: Odd=Back, Even=Front'}
                    </div>
                    <div class="pair-ex-sub">
                      {isAF ? 'Page 1→Front, Page 2→Back, Page 3→Front…' : 'Page 1→Back, Page 2→Front, Page 3→Back…'}
                    </div>
                  </div>
                </div>
              {/if}

              <p class="preview-info-text">
                {prevPages.length} pages → {impLayout === 'single' ? prevPages.length : cardCount} cards.
              </p>

              <div class="preview-grid">
                {#each prevPages as p, i (p.pageNum)}
                  {@const isOdd = i % 2 === 0}
                  {@const role = impLayout === 'single' ? 'single' : (isAF ? (isOdd ? 'front' : 'back') : (isOdd ? 'back' : 'front'))}
                  {@const pairN = Math.floor(i / 2) + 1}
                  <div class="preview-thumb pt-{role}">
                    <img src={p.img} alt="" loading="lazy" />
                    {#if impLayout !== 'single'}
                      <span class="pt-pair-num">Card {pairN}</span>
                      <span class="pt-role-badge">{role}</span>
                    {/if}
                    <span class="pt-num">p{p.pageNum}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 3: Progress -->
      {#if impStep === 3}
        <div class="import-step active">
          <div class="import-progress-wrap">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width: {importProgress}%"></div>
            </div>
            <div class="progress-text-label">{importProgressText}</div>
          </div>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <div class="draw-controls-row" style="gap:10px">
        {#if impStep === 2}
          <button class="btn btn-secondary" on:click={() => impStep = 1}>← Back</button>
        {/if}
        {#if impStep < 3}
          <button class="btn btn-secondary" on:click={() => importModalOpen.set(false)}>Cancel</button>
        {/if}
        {#if impStep === 1}
          <button class="btn btn-primary" on:click={importNext} disabled={isNextDisabled}>Preview →</button>
        {:else if impStep === 2}
          <button class="btn btn-primary" on:click={startImport}>Import Deck →</button>
        {/if}
      </div>
    </div>
  </div>
</div>
