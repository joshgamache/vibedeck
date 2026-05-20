# The Deck — MCG Card Reader: Project Handoff

## What This Is

A portable, single-file HTML web application for using Monte Cook Games card decks (Cypher Deck, Weird Deck, GM Intrusion Deck, Monster Decks, etc.) digitally. It runs entirely in the browser with no server needed — open the HTML file directly on Android Chrome or desktop.

---

## Key Design Decisions Already Made

- **Single portable HTML file** — no build step, no dependencies to install, works offline
- **IndexedDB for storage** — handles large image data, persists between sessions
- **PDF.js for import** — renders each PDF page to a JPEG canvas, stores in IndexedDB
- **Aesthetic** — dark "ancient technology" / sci-fantasy theme. Cinzel (display) + Crimson Pro (body) fonts. Amber/gold accents on deep slate background. Noise texture overlay. Card flip animation on draw.
- **No frameworks** — vanilla JS only

---

## Current Features (Fully Implemented)

### Draw View
- Deck selector dropdown with cards-remaining badge
- Progress bar (drawn / total)
- Card display with CSS 3D flip animation (front/back faces)
- Tap card to flip (when paired layout imported)
- Tap card image to open fullscreen lightbox
- "≡ Text" button shows extracted PDF text beneath card
- Draw, Reshuffle buttons
- Draw history persisted per deck

### Import Wizard (3-step)
**Step 1 — Configure:**
- Deck name input
- PDF file picker (tap or drag & drop)
- Layout picker (3 options):
  - **Single** — 1 page = 1 card, no back face
  - **Paired A** — Odd pages = Front, Even pages = Back
  - **Paired B** — Odd pages = Back, Even pages = Front (handles MCG PDFs where backs come first)
- Render quality selector (Standard / High / Maximum)

**Step 2 — Preview (before committing):**
- Low-res thumbnail render of all pages
- In paired mode: colour-coded thumbnails (amber border = front, blue border = back), per-thumbnail "Card N / front/back" label
- Pair example panel showing first two pages and explaining the pairing
- Layout can be switched live to update the preview
- Back button to reconfigure

**Step 3 — Import:**
- Full-quality re-render with progress bar
- Saves deck + cards + shuffled draw state to IndexedDB

### Library View
- Lists all imported decks with preview thumbnail, card count, import date
- **Use** button — switches Draw view to that deck
- **⌗ Split** button — opens Deck Splitter
- **✕** button — deletes deck and all associated data

### Deck Splitter
- Shows all cards in the deck as thumbnails (sorted by page number)
- Add named ranges with page-from / page-to fields
- Each range gets a distinct colour; cards in the grid get coloured borders + top bars in real time as you type page numbers
- Card count shown per range
- Option: keep or delete original deck after splitting
- Creates independent sub-decks with their own shuffled draw states
- Use case: a Cypher Deck PDF has illustration cards (pages 1–54) and detail/text cards (pages 55–108) that shouldn't be mixed — split them into two named decks

### History View
- Thumbnail grid of all cards drawn from current deck (most recent first)
- Tap any thumbnail to zoom in lightbox
- Clear history button

---

## Data Model (IndexedDB)

**`decks` store** — keyed by `id`
```
{ id, name, cardCount, createdAt, previewImage (jpeg dataURL) }
```

**`cards` store** — keyed by `id`, indexed by `deckId`
```
{ id, deckId, pageNum, front (jpeg dataURL), back (jpeg dataURL | null), text }
```

**`drawState` store** — keyed by `deckId`
```
{ deckId, remaining: [cardId, ...], drawn: [cardId, ...] }
```

**`history` store** — auto-increment `id`, indexed by `deckId`
```
{ id, deckId, cardId, drawnAt (timestamp) }
```

---

## Next Feature: Local Network Sharing (Not Yet Built)

This was being actively designed when the chat ended. The goal is to share card draws across devices on the same table (e.g. GM draws a card, it appears on a player's phone).

### The Problem
Pure browser HTML files can't run servers or open raw sockets. Options discussed:

| Option | How | Pros | Cons |
|---|---|---|---|
| **WebRTC + PeerJS** | Room code, needs brief internet for handshake | Clean UX, peer-to-peer after connect | Requires internet at start |
| **WebRTC manual signaling** | Exchange offer/answer blobs (or QR codes) | Fully offline/LAN | Clunky setup |
| **Local server (Node/Python)** | One terminal command, others connect via IP | Most robust, truly local | Requires terminal comfort |
| **Separate GM + Player files** | GM controls, pushes reveals to players | Clean role separation | More complex to build |

### Questions That Were Asked (Answers Not Yet Received)
1. What's your typical setup? (Always internet / Sometimes offline / Fully offline LAN)
2. How separate should GM/Player be? (GM pushes cards / Players browse / Just mirror draws)
3. Comfortable with a terminal command on GM device? (Yes / No / Maybe)

**Recommendation pending answers:** WebRTC + PeerJS with separate GM/Player HTML files is probably the sweet spot for most setups. If fully offline, manual QR-code WebRTC signaling. If terminal is fine, a tiny Node.js server is most robust.

---

## The Current Full Source Code

Save the following as `card-deck-app.html` and open in Chrome on Android or any desktop browser.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>The Deck — Monte Cook Card Reader</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>
:root {
  --bg:#080810;--bg2:#0f0f1a;--bg3:#161625;--bg4:#1c1c2e;
  --border:#2a2a42;--border2:#3a3a58;
  --amber:#d4943a;--amber2:#f0b855;--amber-dim:#a06820;
  --text:#e8e4d8;--text-dim:#9a9480;--text-muted:#5a5468;
  --red:#c45040;--green:#4a9060;--blue:#4070b8;
  --card-bg:#12121e;
  --shadow:0 8px 40px rgba(0,0,0,.8);
  --glow:0 0 20px rgba(212,148,58,.15);
  --radius:12px;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'Crimson Pro',Georgia,serif;min-height:100vh;overflow-x:hidden;}
body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:0;opacity:.35;}
#app{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;}
header{background:linear-gradient(180deg,#0d0d1a 0%,transparent 100%);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px);}
.logo{font-family:'Cinzel',serif;font-size:1.1rem;font-weight:700;color:var(--amber);letter-spacing:.08em;text-transform:uppercase;flex:1;}
.logo span{color:var(--text-dim);font-weight:400;}
nav{background:var(--bg2);border-bottom:1px solid var(--border);display:flex;padding:0 8px;overflow-x:auto;scrollbar-width:none;}
nav::-webkit-scrollbar{display:none;}
.nav-tab{font-family:'Cinzel',serif;font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);padding:12px 16px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s;}
.nav-tab:hover{color:var(--text-dim);}
.nav-tab.active{color:var(--amber);border-bottom-color:var(--amber);}
main{flex:1;padding:20px;max-width:700px;margin:0 auto;width:100%;}
.view{display:none;}.view.active{display:block;}
.deck-selector-bar{display:flex;align-items:center;gap:10px;margin-bottom:20px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;}
.deck-label{font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap;}
select.deck-select{flex:1;background:transparent;border:none;color:var(--text);font-family:'Crimson Pro',serif;font-size:1rem;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;}
select.deck-select option{background:#1a1a2e;}
.deck-count-badge{font-size:.75rem;color:var(--text-muted);background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:2px 8px;white-space:nowrap;}
.card-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:16px;margin-bottom:24px;}
.card-frame{width:100%;max-width:420px;aspect-ratio:2.5/3.5;background:var(--card-bg);border:1px solid var(--border2);border-radius:16px;overflow:hidden;box-shadow:var(--shadow),var(--glow);position:relative;transition:transform .3s ease,box-shadow .3s ease;cursor:default;}
.card-frame.flippable{cursor:pointer;}
.card-frame.flippable:hover{transform:translateY(-4px);box-shadow:var(--shadow),0 0 30px rgba(212,148,58,.25);}
.card-inner{width:100%;height:100%;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.4,0,.2,1);}
.card-frame.flipped .card-inner{transform:rotateY(180deg);}
.card-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.card-face.back{transform:rotateY(180deg);}
.card-face img{width:100%;height:100%;object-fit:contain;display:block;}
.card-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:100%;padding:40px;text-align:center;}
.card-empty-symbol{font-size:3rem;opacity:.2;line-height:1;}
.card-empty-text{font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:.1em;color:var(--text-muted);text-transform:uppercase;}
.card-frame::before,.card-frame::after{content:'';position:absolute;width:20px;height:20px;border-color:var(--amber-dim);border-style:solid;opacity:.3;z-index:2;pointer-events:none;}
.card-frame::before{top:8px;left:8px;border-width:1px 0 0 1px;}
.card-frame::after{bottom:8px;right:8px;border-width:0 1px 1px 0;}
.card-text-panel{width:100%;max-width:420px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;font-size:.95rem;line-height:1.6;color:var(--text-dim);max-height:150px;overflow-y:auto;display:none;}
.card-text-panel.visible{display:block;}
.card-text-panel::-webkit-scrollbar{width:4px;}
.card-text-panel::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px;}
.flip-hint{font-size:.75rem;color:var(--text-muted);font-style:italic;text-align:center;}
.card-meta{display:flex;align-items:center;gap:12px;width:100%;max-width:420px;justify-content:space-between;}
.card-num{font-family:'Cinzel',serif;font-size:.7rem;color:var(--text-muted);letter-spacing:.08em;}
.card-drawn-time{font-size:.78rem;color:var(--text-muted);font-style:italic;}
.deck-progress{width:100%;max-width:420px;margin:0 auto 4px;}
.deck-progress-bar{height:2px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:6px;}
.deck-progress-fill{height:100%;background:linear-gradient(90deg,var(--amber-dim),var(--amber));border-radius:2px;transition:width .4s ease;}
.deck-progress-text{display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-muted);}
.draw-controls{display:flex;flex-direction:column;gap:10px;align-items:center;width:100%;max-width:420px;margin:0 auto;}
.draw-controls-row{display:flex;gap:10px;width:100%;}
.btn{border:none;border-radius:8px;font-family:'Cinzel',serif;font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;padding:12px 20px;transition:all .2s ease;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;}
.btn-primary{background:linear-gradient(135deg,var(--amber-dim) 0%,var(--amber) 100%);color:#0a0808;flex:1;padding:16px 24px;font-size:.8rem;box-shadow:0 4px 20px rgba(212,148,58,.25);}
.btn-primary:hover{box-shadow:0 4px 30px rgba(212,148,58,.45);transform:translateY(-1px);}
.btn-primary:active{transform:translateY(0);}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none;}
.btn-secondary{background:var(--bg3);border:1px solid var(--border2);color:var(--text-dim);flex:1;}
.btn-secondary:hover{border-color:var(--amber-dim);color:var(--amber);}
.btn-secondary:disabled{opacity:.4;cursor:not-allowed;}
.btn-danger{background:var(--bg3);border:1px solid var(--border);color:var(--red);}
.btn-danger:hover{border-color:var(--red);background:rgba(196,80,64,.1);}
.btn-ghost{background:none;border:1px solid var(--border);color:var(--text-muted);padding:8px 14px;font-size:.65rem;}
.btn-ghost:hover{border-color:var(--border2);color:var(--text);}
.btn-blue{background:rgba(64,112,184,.15);border:1px solid rgba(64,112,184,.4);color:#7aabee;}
.btn-blue:hover{background:rgba(64,112,184,.25);border-color:rgba(64,112,184,.7);}
.history-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.section-title{font-family:'Cinzel',serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--amber);}
.history-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
@media(min-width:480px){.history-grid{grid-template-columns:repeat(4,1fr);}}
@media(min-width:600px){.history-grid{grid-template-columns:repeat(5,1fr);}}
.history-card-thumb{aspect-ratio:2.5/3.5;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;transition:all .2s;position:relative;}
.history-card-thumb:hover{border-color:var(--amber-dim);transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.6);}
.history-card-thumb img{width:100%;height:100%;object-fit:contain;}
.history-card-thumb .thumb-num{position:absolute;bottom:4px;right:5px;font-family:'Cinzel',serif;font-size:.55rem;color:rgba(255,255,255,.5);background:rgba(0,0,0,.7);padding:1px 4px;border-radius:3px;}
.library-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.deck-list{display:flex;flex-direction:column;gap:10px;}
.deck-item{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;display:flex;align-items:center;gap:12px;transition:border-color .2s;}
.deck-item:hover{border-color:var(--border2);}
.deck-item.current{border-color:var(--amber-dim);}
.deck-item-preview{width:36px;height:50px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;flex-shrink:0;}
.deck-item-preview img{width:100%;height:100%;object-fit:cover;}
.deck-item-info{flex:1;min-width:0;}
.deck-item-name{font-family:'Cinzel',serif;font-size:.9rem;font-weight:600;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.deck-item-meta{font-size:.8rem;color:var(--text-muted);}
.deck-item-actions{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}
.empty-state{text-align:center;padding:60px 20px;display:flex;flex-direction:column;align-items:center;gap:12px;}
.empty-state-icon{font-size:3rem;opacity:.15;}
.empty-state-title{font-family:'Cinzel',serif;font-size:.85rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);}
.empty-state-sub{font-size:.9rem;color:var(--text-muted);max-width:280px;line-height:1.5;font-style:italic;}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);}
.modal-overlay.open{display:flex;}
@media(min-width:600px){.modal-overlay{align-items:center;}}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:16px 16px 0 0;width:100%;max-width:680px;max-height:96vh;display:flex;flex-direction:column;animation:slideUp .3s ease;}
@media(min-width:600px){.modal{border-radius:16px;}}
@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
.modal-header{padding:20px 20px 0;flex-shrink:0;}
.modal-title{font-family:'Cinzel',serif;font-size:1rem;font-weight:700;letter-spacing:.08em;color:var(--amber);text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.modal-close{background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:4px;line-height:1;}
.modal-close:hover{color:var(--text);}
.modal-body{padding:4px 20px 0;overflow-y:auto;flex:1;}
.modal-body::-webkit-scrollbar{width:4px;}
.modal-body::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px;}
.modal-footer{padding:16px 20px 20px;flex-shrink:0;border-top:1px solid var(--border);margin-top:4px;}
.stepper{display:flex;margin-bottom:20px;}
.step-dot{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;}
.step-dot::before{content:'';position:absolute;top:10px;left:50%;right:-50%;height:1px;background:var(--border);z-index:0;}
.step-dot:last-child::before{display:none;}
.step-circle{width:20px;height:20px;border-radius:50%;border:1px solid var(--border2);background:var(--bg3);font-family:'Cinzel',serif;font-size:.6rem;display:flex;align-items:center;justify-content:center;position:relative;z-index:1;transition:all .3s;color:var(--text-muted);}
.step-dot.active .step-circle{border-color:var(--amber);background:var(--amber);color:#000;}
.step-dot.done .step-circle{border-color:var(--green);background:rgba(74,144,96,.2);color:var(--green);}
.step-label{font-family:'Cinzel',serif;font-size:.58rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);}
.step-dot.active .step-label{color:var(--amber);}
.import-step{display:none;padding-bottom:8px;}
.import-step.active{display:block;}
.form-group{margin-bottom:16px;}
.form-label{display:block;font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;}
.form-input{width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:'Crimson Pro',serif;font-size:1rem;padding:10px 14px;outline:none;transition:border-color .2s;}
.form-input:focus{border-color:var(--amber-dim);}
select.form-input{appearance:none;-webkit-appearance:none;cursor:pointer;}
.drop-zone{border:2px dashed var(--border2);border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;}
.drop-zone:hover,.drop-zone.drag-over{border-color:var(--amber-dim);background:rgba(212,148,58,.05);}
.drop-zone input[type="file"]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.drop-zone-icon{font-size:2rem;margin-bottom:8px;opacity:.4;}
.drop-zone-text{font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:.1em;color:var(--text-muted);text-transform:uppercase;}
.drop-zone-sub{font-size:.8rem;color:var(--text-muted);margin-top:4px;font-style:italic;}
.layout-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.layout-option{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 6px;cursor:pointer;text-align:center;transition:all .2s;}
.layout-option:hover{border-color:var(--border2);}
.layout-option.selected{border-color:var(--amber-dim);background:rgba(212,148,58,.07);}
.layout-option-icon{font-size:1.3rem;margin-bottom:5px;opacity:.55;}
.layout-option.selected .layout-option-icon{opacity:1;}
.layout-option-title{font-family:'Cinzel',serif;font-size:.66rem;letter-spacing:.06em;color:var(--text);margin-bottom:3px;}
.layout-option-sub{font-size:.7rem;color:var(--text-muted);font-style:italic;line-height:1.3;}
.preview-loading{text-align:center;padding:40px 20px;}
.preview-loading-icon{font-size:2rem;opacity:.3;margin-bottom:8px;}
.preview-loading-text{font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:.1em;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;}
.mini-progress{height:2px;background:var(--border);border-radius:2px;overflow:hidden;margin:10px auto;max-width:200px;}
.mini-progress-fill{height:100%;background:var(--amber);border-radius:2px;transition:width .2s;}
.pair-example{display:flex;gap:12px;align-items:center;background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;}
.pair-ex-col{flex:1;max-width:80px;}
.pair-ex-col .ex-label{font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.08em;text-align:center;padding:3px;margin-bottom:4px;border-radius:4px;text-transform:uppercase;}
.pair-ex-col.is-front .ex-label{background:rgba(160,104,32,.3);color:var(--amber);}
.pair-ex-col.is-back .ex-label{background:rgba(40,70,130,.3);color:#7aabee;}
.ex-thumb{aspect-ratio:2.5/3.5;border-radius:6px;overflow:hidden;border:2px solid;background:var(--card-bg);}
.is-front .ex-thumb{border-color:var(--amber-dim);}
.is-back .ex-thumb{border-color:var(--blue);}
.ex-thumb img{width:100%;height:100%;object-fit:contain;}
.pair-ex-arrow{color:var(--text-muted);font-size:1.1rem;flex-shrink:0;}
.pair-ex-info{flex:1;}
.pair-ex-title{font-family:'Cinzel',serif;font-size:.75rem;color:var(--text-dim);margin-bottom:4px;}
.pair-ex-sub{font-size:.82rem;color:var(--text-muted);font-style:italic;line-height:1.4;}
.preview-info-text{font-size:.88rem;color:var(--text-dim);font-style:italic;margin-bottom:12px;line-height:1.5;}
.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding-bottom:4px;}
@media(min-width:400px){.preview-grid{grid-template-columns:repeat(4,1fr);}}
@media(min-width:520px){.preview-grid{grid-template-columns:repeat(5,1fr);}}
.preview-thumb{position:relative;aspect-ratio:2.5/3.5;border-radius:6px;overflow:hidden;border:2px solid var(--border);background:var(--card-bg);}
.preview-thumb img{width:100%;height:100%;object-fit:contain;}
.pt-front{border-color:var(--amber-dim);}
.pt-back{border-color:var(--blue);}
.pt-num{position:absolute;top:3px;right:4px;font-family:'Cinzel',serif;font-size:.5rem;color:rgba(255,255,255,.5);background:rgba(0,0,0,.55);padding:1px 4px;border-radius:3px;}
.pt-role-badge{position:absolute;bottom:0;left:0;right:0;text-align:center;font-family:'Cinzel',serif;font-size:.5rem;letter-spacing:.05em;padding:2px 0;text-transform:uppercase;}
.pt-front .pt-role-badge{background:rgba(160,104,32,.85);color:#ffe8b0;}
.pt-back .pt-role-badge{background:rgba(40,70,130,.85);color:#aac8f0;}
.pt-pair-num{position:absolute;top:3px;left:4px;font-family:'Cinzel',serif;font-size:.48rem;color:rgba(255,255,255,.45);background:rgba(0,0,0,.5);padding:1px 4px;border-radius:3px;}
.import-progress-wrap{padding:24px 0;}
.progress-bar-wrap{background:var(--border);border-radius:4px;height:4px;overflow:hidden;margin-bottom:10px;}
.progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--amber-dim),var(--amber2));border-radius:4px;transition:width .25s ease;}
.progress-text-label{font-size:.85rem;color:var(--text-muted);text-align:center;font-style:italic;}
.split-section-label{font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}
.split-card-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
@media(min-width:420px){.split-card-grid{grid-template-columns:repeat(5,1fr);}}
@media(min-width:540px){.split-card-grid{grid-template-columns:repeat(6,1fr);}}
.split-card-thumb{position:relative;aspect-ratio:2.5/3.5;border-radius:5px;overflow:hidden;border:2px solid var(--border);background:var(--card-bg);cursor:pointer;transition:border-color .15s;}
.split-card-thumb img{width:100%;height:100%;object-fit:contain;}
.split-card-thumb .sc-num{position:absolute;bottom:2px;right:3px;font-family:'Cinzel',serif;font-size:.48rem;color:rgba(255,255,255,.45);background:rgba(0,0,0,.6);padding:1px 3px;border-radius:2px;}
.split-card-thumb .sc-bar{position:absolute;top:0;left:0;right:0;height:3px;}
.split-ranges-section{margin-top:20px;}
.range-item{background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;}
.range-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.range-color-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
.range-name-input{flex:1;background:transparent;border:none;border-bottom:1px solid var(--border2);color:var(--text);font-family:'Crimson Pro',serif;font-size:1rem;padding:2px 4px;outline:none;}
.range-name-input:focus{border-bottom-color:var(--amber-dim);}
.range-del-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:4px;line-height:1;}
.range-del-btn:hover{color:var(--red);}
.range-fields{display:flex;gap:8px;align-items:center;}
.range-field{flex:1;}
.range-field-label{font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;}
.range-num-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Crimson Pro',serif;font-size:.95rem;padding:6px 10px;outline:none;text-align:center;}
.range-num-input:focus{border-color:var(--amber-dim);}
.range-sep{color:var(--text-muted);font-size:1.2rem;padding-top:18px;}
.range-card-count{font-size:.78rem;color:var(--text-muted);font-style:italic;text-align:center;margin-top:6px;}
.no-ranges{font-size:.9rem;color:var(--text-muted);font-style:italic;text-align:center;padding:20px;}
.split-after-section{margin-top:16px;}
.split-option-row{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--bg4);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;}
.split-option-row input[type=radio]{accent-color:var(--amber);width:14px;height:14px;margin-top:3px;flex-shrink:0;}
.split-opt-title{font-size:.9rem;color:var(--text);margin-bottom:1px;}
.split-opt-sub{font-size:.78rem;color:var(--text-muted);font-style:italic;}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.96);z-index:300;display:none;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;}
.lightbox.open{display:flex;}
.lightbox img{max-width:100%;max-height:90vh;object-fit:contain;border-radius:8px;cursor:default;}
.lightbox-close{position:fixed;top:16px;right:16px;background:rgba(0,0,0,.6);border:1px solid var(--border);color:var(--text);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
.toast-container{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:400;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}
.toast{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:10px 18px;border-radius:20px;font-size:.85rem;animation:toastIn .3s ease;white-space:nowrap;}
.toast.error{border-color:var(--red);color:var(--red);}
.toast.success{border-color:var(--green);color:#6ab880;}
@keyframes toastIn{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes cardReveal{0%{transform:rotateY(90deg) scale(.9);opacity:0}100%{transform:rotateY(0deg) scale(1);opacity:1}}
.card-frame.revealing{animation:cardReveal .35s cubic-bezier(.34,1.56,.64,1);}
.divider{height:1px;background:var(--border);margin:12px 0;}
</style>
</head>
<body>
<div id="app">
<header>
  <div class="logo">The Deck <span>/ MCG Card Reader</span></div>
  <button class="btn btn-ghost" onclick="openImportModal()">+ Import</button>
</header>
<nav>
  <button class="nav-tab active" onclick="switchTab('draw',this)">Draw</button>
  <button class="nav-tab" onclick="switchTab('history',this)">History</button>
  <button class="nav-tab" onclick="switchTab('library',this)">Library</button>
</nav>
<main>
  <div id="view-draw" class="view active">
    <div class="deck-selector-bar">
      <span class="deck-label">Deck</span>
      <select class="deck-select" id="deck-select" onchange="onDeckChange(this.value)">
        <option value="">— No decks imported —</option>
      </select>
      <span class="deck-count-badge" id="deck-count-badge">0 left</span>
    </div>
    <div class="deck-progress">
      <div class="deck-progress-bar"><div class="deck-progress-fill" id="deck-progress-fill" style="width:0%"></div></div>
      <div class="deck-progress-text"><span id="progress-drawn">0 drawn</span><span id="progress-total">0 total</span></div>
    </div>
    <div class="card-stage">
      <div class="card-frame" id="card-frame" onclick="handleCardClick()">
        <div class="card-inner">
          <div class="card-face front" id="card-face-front">
            <div class="card-empty"><div class="card-empty-symbol">✦</div><div class="card-empty-text">No card drawn</div></div>
          </div>
          <div class="card-face back" id="card-face-back"></div>
        </div>
      </div>
      <div class="card-meta" id="card-meta" style="display:none">
        <span class="card-num" id="card-num-display"></span>
        <span class="card-drawn-time" id="card-drawn-time"></span>
      </div>
      <div class="flip-hint" id="flip-hint" style="display:none">Tap card to flip</div>
      <div class="card-text-panel" id="card-text-panel"></div>
    </div>
    <div class="draw-controls">
      <div class="draw-controls-row">
        <button class="btn btn-primary" id="draw-btn" onclick="drawCard()" disabled>✦ Draw Card</button>
      </div>
      <div class="draw-controls-row">
        <button class="btn btn-secondary" id="reshuffle-btn" onclick="reshuffleDeck()" disabled>↺ Reshuffle</button>
        <button class="btn btn-secondary" id="text-btn" onclick="toggleCardText()" disabled>≡ Text</button>
      </div>
    </div>
  </div>
  <div id="view-history" class="view">
    <div class="history-header">
      <span class="section-title" id="history-title">Draw History</span>
      <button class="btn btn-ghost" onclick="clearHistory()">Clear</button>
    </div>
    <div id="history-content">
      <div class="empty-state"><div class="empty-state-icon">🃏</div><div class="empty-state-title">No cards drawn yet</div><div class="empty-state-sub">Cards you draw will appear here.</div></div>
    </div>
  </div>
  <div id="view-library" class="view">
    <div class="library-top">
      <span class="section-title">My Decks</span>
      <button class="btn btn-ghost" onclick="openImportModal()">+ Import PDF</button>
    </div>
    <div id="library-content">
      <div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-title">No decks imported</div><div class="empty-state-sub">Import a Monte Cook Games card deck PDF to get started.</div></div>
    </div>
  </div>
</main>
</div>
<div class="modal-overlay" id="import-modal">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">Import Deck<button class="modal-close" onclick="closeImportModal()">✕</button></div>
      <div class="stepper">
        <div class="step-dot active" id="sdot-1"><div class="step-circle">1</div><div class="step-label">Configure</div></div>
        <div class="step-dot" id="sdot-2"><div class="step-circle">2</div><div class="step-label">Preview</div></div>
        <div class="step-dot" id="sdot-3"><div class="step-circle">3</div><div class="step-label">Import</div></div>
      </div>
    </div>
    <div class="modal-body">
      <div class="import-step active" id="istep-1">
        <div class="form-group">
          <label class="form-label">Deck Name</label>
          <input type="text" class="form-input" id="import-name" placeholder="e.g. Cypher Deck, Weird Deck…" oninput="checkStep1()">
        </div>
        <div class="form-group">
          <label class="form-label">PDF File</label>
          <div class="drop-zone" id="drop-zone">
            <input type="file" accept=".pdf" id="pdf-file-input" onchange="onFileSelected(event)">
            <div class="drop-zone-icon">📄</div>
            <div class="drop-zone-text" id="drop-zone-text">Tap to choose PDF</div>
            <div class="drop-zone-sub">or drag &amp; drop</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Card Layout</label>
          <div class="layout-grid">
            <div class="layout-option selected" id="lo-single" onclick="setLayout('single',this)">
              <div class="layout-option-icon">🃏</div>
              <div class="layout-option-title">Single</div>
              <div class="layout-option-sub">1 page = 1 card, no back face</div>
            </div>
            <div class="layout-option" id="lo-paired-af" onclick="setLayout('paired-af',this)">
              <div class="layout-option-icon">↕</div>
              <div class="layout-option-title">Paired A</div>
              <div class="layout-option-sub">Odd pages = Front Even pages = Back</div>
            </div>
            <div class="layout-option" id="lo-paired-bf" onclick="setLayout('paired-bf',this)">
              <div class="layout-option-icon">↕</div>
              <div class="layout-option-title">Paired B</div>
              <div class="layout-option-sub">Odd pages = Back Even pages = Front</div>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Render Quality</label>
          <select class="form-input" id="import-quality">
            <option value="1.5">Standard (faster)</option>
            <option value="2" selected>High (recommended)</option>
            <option value="2.5">Maximum (large files)</option>
          </select>
        </div>
      </div>
      <div class="import-step" id="istep-2">
        <div id="preview-loading" style="display:none">
          <div class="preview-loading">
            <div class="preview-loading-icon">⏳</div>
            <div class="preview-loading-text">Rendering preview pages…</div>
            <div class="mini-progress"><div class="mini-progress-fill" id="mini-pf" style="width:0%"></div></div>
          </div>
        </div>
        <div id="preview-content" style="display:none">
          <div id="pair-example" class="pair-example" style="display:none">
            <div class="pair-ex-col is-front"><div class="ex-label">Front</div><div class="ex-thumb"><img id="ex-front-img" src="" alt=""></div></div>
            <div class="pair-ex-arrow">⟷</div>
            <div class="pair-ex-col is-back"><div class="ex-label">Back</div><div class="ex-thumb"><img id="ex-back-img" src="" alt=""></div></div>
            <div class="pair-ex-info"><div class="pair-ex-title" id="pex-title"></div><div class="pair-ex-sub" id="pex-sub"></div></div>
          </div>
          <p class="preview-info-text" id="preview-info-text"></p>
          <div class="preview-grid" id="preview-grid"></div>
        </div>
      </div>
      <div class="import-step" id="istep-3">
        <div class="import-progress-wrap">
          <div class="progress-bar-wrap"><div class="progress-bar-fill" id="imp-pf" style="width:0%"></div></div>
          <div class="progress-text-label" id="imp-pt">Preparing…</div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <div class="draw-controls-row" style="gap:10px">
        <button class="btn btn-secondary" id="ibtn-back" onclick="importBack()" style="display:none">← Back</button>
        <button class="btn btn-secondary" id="ibtn-cancel" onclick="closeImportModal()">Cancel</button>
        <button class="btn btn-primary" id="ibtn-next" onclick="importNext()" disabled>Preview →</button>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="split-modal">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" style="font-size:.85rem">Split: <span id="split-deck-name" style="color:var(--text-dim);font-weight:400"></span><button class="modal-close" onclick="closeSplitModal()">✕</button></div>
    </div>
    <div class="modal-body">
      <div class="split-section-label">All Cards <span id="split-total" style="color:var(--text-muted)"></span></div>
      <div class="split-card-grid" id="split-card-grid">
        <div class="empty-state" style="grid-column:1/-1;padding:24px 0"><div class="empty-state-icon" style="font-size:1.5rem">⏳</div><div class="empty-state-title">Loading…</div></div>
      </div>
      <div class="split-ranges-section">
        <div class="split-section-label">Named Ranges<button class="btn btn-ghost" style="padding:5px 10px;font-size:.6rem" onclick="addSplitRange()">+ Add Range</button></div>
        <div id="split-ranges-list"><div class="no-ranges">No ranges yet — add a range and assign page numbers.</div></div>
      </div>
      <div class="split-after-section">
        <div class="split-section-label" style="margin-bottom:8px">After creating sub-decks…</div>
        <label class="split-option-row"><input type="radio" name="split-after" value="keep" checked><div><div class="split-opt-title">Keep original deck</div><div class="split-opt-sub">Source deck remains alongside new sub-decks</div></div></label>
        <label class="split-option-row"><input type="radio" name="split-after" value="delete"><div><div class="split-opt-title">Delete original deck</div><div class="split-opt-sub">Remove source deck after splitting</div></div></label>
      </div>
    </div>
    <div class="modal-footer">
      <div class="draw-controls-row" style="gap:10px">
        <button class="btn btn-secondary" onclick="closeSplitModal()">Cancel</button>
        <button class="btn btn-primary" id="split-confirm-btn" onclick="confirmSplit()" disabled>Create Sub-decks</button>
      </div>
    </div>
  </div>
</div>
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <button class="lightbox-close" onclick="closeLightbox()">✕</button>
  <img id="lightbox-img" src="" alt="">
</div>
<div class="toast-container" id="toast-container"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let db;
function initDB(){return new Promise((res,rej)=>{const req=indexedDB.open('the-deck-v1',1);req.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('decks'))d.createObjectStore('decks',{keyPath:'id'});if(!d.objectStoreNames.contains('cards')){const s=d.createObjectStore('cards',{keyPath:'id'});s.createIndex('deckId','deckId');}if(!d.objectStoreNames.contains('history')){const s=d.createObjectStore('history',{keyPath:'id',autoIncrement:true});s.createIndex('deckId','deckId');}if(!d.objectStoreNames.contains('drawState'))d.createObjectStore('drawState',{keyPath:'deckId'});};req.onsuccess=e=>{db=e.target.result;res(db);};req.onerror=e=>rej(e);});}
const iGet=(s,k)=>new Promise((r,j)=>{const q=db.transaction(s,'readonly').objectStore(s).get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
const iPut=(s,o)=>new Promise((r,j)=>{const q=db.transaction(s,'readwrite').objectStore(s).put(o);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
const iDel=(s,k)=>new Promise((r,j)=>{const q=db.transaction(s,'readwrite').objectStore(s).delete(k);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});
const iAll=(s)=>new Promise((r,j)=>{const q=db.transaction(s,'readonly').objectStore(s).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
const iIdx=(s,i,v)=>new Promise((r,j)=>{const q=db.transaction(s,'readonly').objectStore(s).index(i).getAll(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
function iDelIdx(store,index,value){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const os=tx.objectStore(store);const req=os.index(index).getAllKeys(value);req.onsuccess=()=>{const keys=req.result;if(!keys.length)return res();keys.forEach(k=>os.delete(k));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);};req.onerror=()=>rej(req.error);});}
function iBulkPut(store,items){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const os=tx.objectStore(store);items.forEach(i=>os.put(i));tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
const S={decks:[],currentDeckId:null,currentCard:null,drawState:{},history:{},cardFlipped:false,showText:false};
let impFile=null,impLayout='single',impStep=1,prevPages=[];
let splitDeckId=null,splitCards=[],splitRanges=[];
const RCOLORS=['#d4943a','#7aabee','#9b7fd4','#5db87f','#e07070','#c4a840','#6bccc4','#e09060'];
async function init(){await initDB();S.decks=await iAll('decks');const ds=await iAll('drawState');ds.forEach(d=>S.drawState[d.deckId]=d);const last=localStorage.getItem('lastDeckId');if(last&&S.decks.find(d=>d.id===last))S.currentDeckId=last;else if(S.decks.length)S.currentDeckId=S.decks[0].id;renderDeckSelect();renderLibrary();await loadDeckState();updateDrawView();renderHistory();}
function renderDeckSelect(){const sel=document.getElementById('deck-select');sel.innerHTML='';if(!S.decks.length){sel.innerHTML='<option value="">— No decks imported —</option>';return;}S.decks.forEach(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=d.name;if(d.id===S.currentDeckId)o.selected=true;sel.appendChild(o);});}
async function onDeckChange(id){if(!id)return;S.currentDeckId=id;S.currentCard=null;S.cardFlipped=false;localStorage.setItem('lastDeckId',id);await loadDeckState();updateDrawView();renderHistory();}
async function loadDeckState(){if(!S.currentDeckId)return;let ds=await iGet('drawState',S.currentDeckId);if(!ds){const cards=await iIdx('cards','deckId',S.currentDeckId);ds={deckId:S.currentDeckId,remaining:shuffle(cards.map(c=>c.id)),drawn:[]};await iPut('drawState',ds);}S.drawState[S.currentDeckId]=ds;const hist=await iIdx('history','deckId',S.currentDeckId);hist.sort((a,b)=>b.drawnAt-a.drawnAt);S.history[S.currentDeckId]=hist;}
async function drawCard(){if(!S.currentDeckId)return;const ds=S.drawState[S.currentDeckId];if(!ds||!ds.remaining.length){showToast('Deck exhausted — reshuffle to continue','error');return;}const cid=ds.remaining[0];ds.remaining=ds.remaining.slice(1);ds.drawn.push(cid);await iPut('drawState',ds);S.currentCard=await iGet('cards',cid);S.cardFlipped=false;S.showText=false;const entry={deckId:S.currentDeckId,cardId:cid,drawnAt:Date.now()};await iPut('history',entry);const h=S.history[S.currentDeckId]||[];h.unshift(entry);S.history[S.currentDeckId]=h;updateDrawView(true);renderHistory();}
async function reshuffleDeck(){if(!S.currentDeckId)return;const cards=await iIdx('cards','deckId',S.currentDeckId);const ds={deckId:S.currentDeckId,remaining:shuffle(cards.map(c=>c.id)),drawn:[]};S.drawState[S.currentDeckId]=ds;await iPut('drawState',ds);S.currentCard=null;S.cardFlipped=false;S.showText=false;updateDrawView();showToast('Deck reshuffled');}
function updateDrawView(animate=false){const hasDeck=!!S.currentDeckId&&S.decks.length>0;const ds=hasDeck?S.drawState[S.currentDeckId]:null;const deck=hasDeck?S.decks.find(d=>d.id===S.currentDeckId):null;document.getElementById('draw-btn').disabled=!hasDeck||!ds||!ds.remaining.length;document.getElementById('reshuffle-btn').disabled=!hasDeck;document.getElementById('text-btn').disabled=!S.currentCard;if(ds&&deck){const pct=deck.cardCount>0?(ds.drawn.length/deck.cardCount*100):0;document.getElementById('deck-progress-fill').style.width=pct+'%';document.getElementById('progress-drawn').textContent=ds.drawn.length+' drawn';document.getElementById('progress-total').textContent=deck.cardCount+' total';document.getElementById('deck-count-badge').textContent=ds.remaining.length+' left';}else{document.getElementById('deck-progress-fill').style.width='0%';document.getElementById('progress-drawn').textContent='0 drawn';document.getElementById('progress-total').textContent='0 total';document.getElementById('deck-count-badge').textContent='0 left';}const front=document.getElementById('card-face-front');const back=document.getElementById('card-face-back');const frame=document.getElementById('card-frame');const textPanel=document.getElementById('card-text-panel');const meta=document.getElementById('card-meta');const flipHint=document.getElementById('flip-hint');if(!S.currentCard){front.innerHTML='<div class="card-empty"><div class="card-empty-symbol">✦</div><div class="card-empty-text">No card drawn</div></div>';back.innerHTML='';frame.classList.remove('flippable','flipped');textPanel.classList.remove('visible');meta.style.display='none';flipHint.style.display='none';return;}const card=S.currentCard,hasBoth=card.front&&card.back;front.innerHTML=`<img src="${card.front}" alt="" onclick="event.stopPropagation();openLightbox('${card.front}')">`;if(hasBoth){back.innerHTML=`<img src="${card.back}" alt="" onclick="event.stopPropagation();openLightbox('${card.back}')">`;frame.classList.add('flippable');flipHint.style.display='block';}else{back.innerHTML='';frame.classList.remove('flippable');flipHint.style.display='none';}S.cardFlipped?frame.classList.add('flipped'):frame.classList.remove('flipped');if(S.showText&&card.text){textPanel.textContent=card.text;textPanel.classList.add('visible');}else textPanel.classList.remove('visible');meta.style.display='flex';document.getElementById('card-num-display').textContent=`Page ${card.pageNum}`;const h=S.history[S.currentDeckId];if(h&&h.length)document.getElementById('card-drawn-time').textContent=fmtTime(h[0].drawnAt);if(animate){frame.classList.remove('revealing');void frame.offsetWidth;frame.classList.add('revealing');setTimeout(()=>frame.classList.remove('revealing'),400);}}
function handleCardClick(){if(!S.currentCard||!(S.currentCard.front&&S.currentCard.back))return;S.cardFlipped=!S.cardFlipped;S.cardFlipped?document.getElementById('card-frame').classList.add('flipped'):document.getElementById('card-frame').classList.remove('flipped');}
function toggleCardText(){if(!S.currentCard)return;S.showText=!S.showText;updateDrawView();}
async function renderHistory(){const cont=document.getElementById('history-content');const title=document.getElementById('history-title');if(!S.currentDeckId){cont.innerHTML='<div class="empty-state"><div class="empty-state-icon">🃏</div><div class="empty-state-title">No deck selected</div></div>';return;}const hist=S.history[S.currentDeckId]||[];const deck=S.decks.find(d=>d.id===S.currentDeckId);title.textContent=deck?`${deck.name} History`:'Draw History';if(!hist.length){cont.innerHTML='<div class="empty-state"><div class="empty-state-icon">🃏</div><div class="empty-state-title">No cards drawn yet</div><div class="empty-state-sub">Cards you draw will appear here.</div></div>';return;}const grid=document.createElement('div');grid.className='history-grid';for(const e of hist){const card=await iGet('cards',e.cardId);if(!card)continue;const t=document.createElement('div');t.className='history-card-thumb';t.innerHTML=`<img src="${card.front}" alt="" loading="lazy"><span class="thumb-num">p${card.pageNum}</span>`;const src=card.front;t.onclick=()=>openLightbox(src);grid.appendChild(t);}cont.innerHTML='';cont.appendChild(grid);}
async function clearHistory(){if(!S.currentDeckId||!confirm('Clear draw history for this deck?'))return;await iDelIdx('history','deckId',S.currentDeckId);S.history[S.currentDeckId]=[];renderHistory();showToast('History cleared');}
function renderLibrary(){const cont=document.getElementById('library-content');if(!S.decks.length){cont.innerHTML='<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-title">No decks imported</div><div class="empty-state-sub">Import a Monte Cook Games card deck PDF to get started.</div></div>';return;}const list=document.createElement('div');list.className='deck-list';S.decks.forEach(deck=>{const el=document.createElement('div');el.className='deck-item'+(deck.id===S.currentDeckId?' current':'');el.innerHTML=`<div class="deck-item-preview">${deck.previewImage?`<img src="${deck.previewImage}" alt="">`:''}</div><div class="deck-item-info"><div class="deck-item-name">${esc(deck.name)}</div><div class="deck-item-meta">${deck.cardCount} cards · ${fmtDate(deck.createdAt)}</div></div><div class="deck-item-actions"><button class="btn btn-ghost" onclick="selectDeckLib('${deck.id}')">Use</button><button class="btn btn-blue btn-ghost" onclick="openSplitModal('${deck.id}')">⌗ Split</button><button class="btn btn-danger btn-ghost" onclick="deleteDeck('${deck.id}')">✕</button></div>`;list.appendChild(el);});cont.innerHTML='';cont.appendChild(list);}
function selectDeckLib(id){document.getElementById('deck-select').value=id;onDeckChange(id);document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.textContent==='Draw'));document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-draw'));}
async function deleteDeck(id){const deck=S.decks.find(d=>d.id===id);if(!deck)return;if(!confirm(`Delete "${deck.name}" and all its cards?`))return;await iDel('decks',id);await iDelIdx('cards','deckId',id);await iDelIdx('history','deckId',id);await iDel('drawState',id);S.decks=S.decks.filter(d=>d.id!==id);delete S.drawState[id];delete S.history[id];if(S.currentDeckId===id){S.currentDeckId=S.decks.length?S.decks[0].id:null;S.currentCard=null;localStorage.setItem('lastDeckId',S.currentDeckId||'');}renderDeckSelect();renderLibrary();await loadDeckState();updateDrawView();renderHistory();showToast('Deck deleted');}
function openImportModal(){impFile=null;impLayout='single';impStep=1;prevPages=[];document.getElementById('import-name').value='';document.getElementById('pdf-file-input').value='';document.getElementById('drop-zone-text').textContent='Tap to choose PDF';document.getElementById('preview-grid').innerHTML='';document.getElementById('preview-loading').style.display='none';document.getElementById('preview-content').style.display='none';document.querySelectorAll('.layout-option').forEach(l=>l.classList.remove('selected'));document.getElementById('lo-single').classList.add('selected');document.getElementById('ibtn-next').style.display='';goStep(1);document.getElementById('import-modal').classList.add('open');}
function closeImportModal(){document.getElementById('import-modal').classList.remove('open');}
function goStep(n){impStep=n;document.querySelectorAll('.import-step').forEach((el,i)=>el.classList.toggle('active',i+1===n));document.querySelectorAll('.step-dot').forEach((el,i)=>{el.classList.toggle('active',i+1===n);el.classList.toggle('done',i+1<n);});const nb=document.getElementById('ibtn-next');const bb=document.getElementById('ibtn-back');const cb=document.getElementById('ibtn-cancel');nb.style.display='';if(n===1){bb.style.display='none';cb.style.display='';nb.textContent='Preview →';nb.onclick=importNext;nb.disabled=!(impFile&&document.getElementById('import-name').value.trim());}else if(n===2){bb.style.display='';cb.style.display='none';nb.textContent='Import Deck →';nb.onclick=startImport;nb.disabled=false;}else{bb.style.display='none';cb.style.display='none';nb.style.display='none';}}
function checkStep1(){document.getElementById('ibtn-next').disabled=!(impFile&&document.getElementById('import-name').value.trim());}
function setLayout(val,el){impLayout=val;document.querySelectorAll('.layout-option').forEach(l=>l.classList.remove('selected'));el.classList.add('selected');if(prevPages.length)renderPrevGrid();}
function onFileSelected(e){const f=e.target.files[0];if(!f)return;impFile=f;document.getElementById('drop-zone-text').textContent=f.name;const ni=document.getElementById('import-name');if(!ni.value)ni.value=f.name.replace(/\.pdf$/i,'').replace(/[-_]/g,' ');checkStep1();}
async function importNext(){if(!impFile)return;goStep(2);document.getElementById('preview-loading').style.display='block';document.getElementById('preview-content').style.display='none';prevPages=[];try{const ab=await impFile.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const total=pdf.numPages;for(let i=1;i<=total;i++){const page=await pdf.getPage(i);const vp=page.getViewport({scale:0.6});const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;let text='';try{const tc=await page.getTextContent();text=tc.items.map(x=>x.str).join(' ').trim();}catch(e){}prevPages.push({img:canvas.toDataURL('image/jpeg',0.75),text,pageNum:i});document.getElementById('mini-pf').style.width=(i/total*100)+'%';}document.getElementById('preview-loading').style.display='none';document.getElementById('preview-content').style.display='block';renderPrevGrid();}catch(err){showToast('Failed to read PDF: '+err.message,'error');goStep(1);}}
function importBack(){if(impStep===2)goStep(1);}
function renderPrevGrid(){const grid=document.getElementById('preview-grid');const info=document.getElementById('preview-info-text');const pex=document.getElementById('pair-example');grid.innerHTML='';if(impLayout==='single'){pex.style.display='none';info.textContent=`${prevPages.length} pages → ${prevPages.length} single-sided cards.`;prevPages.forEach(p=>{const d=document.createElement('div');d.className='preview-thumb';d.innerHTML=`<img src="${p.img}" loading="lazy"><span class="pt-num">p${p.pageNum}</span>`;grid.appendChild(d);});}else{const isAF=impLayout==='paired-af';const cardCount=Math.ceil(prevPages.length/2);pex.style.display='flex';const p0=prevPages[0],p1=prevPages[1];const frontP=isAF?p0:p1,backP=isAF?p1:p0;document.getElementById('ex-front-img').src=frontP?frontP.img:'';document.getElementById('ex-back-img').src=backP?backP.img:'';document.getElementById('pex-title').textContent=isAF?'Layout A: Odd=Front, Even=Back':'Layout B: Odd=Back, Even=Front';document.getElementById('pex-sub').textContent=isAF?'Page 1→Front, Page 2→Back, Page 3→Front…':'Page 1→Back, Page 2→Front, Page 3→Back…';info.textContent=`${prevPages.length} pages → ${cardCount} cards with front & back faces.`;prevPages.forEach((p,i)=>{const isOdd=(i%2===0);let role=isAF?(isOdd?'front':'back'):(isOdd?'back':'front');const pairN=Math.floor(i/2)+1;const d=document.createElement('div');d.className=`preview-thumb pt-${role}`;d.innerHTML=`<img src="${p.img}" loading="lazy"><span class="pt-pair-num">Card ${pairN}</span><span class="pt-num">p${p.pageNum}</span><span class="pt-role-badge">${role}</span>`;grid.appendChild(d);});}}
async function startImport(){if(!impFile)return;const name=document.getElementById('import-name').value.trim();if(!name)return;const quality=parseFloat(document.getElementById('import-quality').value);goStep(3);setImpProg(0,'Reading PDF…');try{const ab=await impFile.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const total=pdf.numPages;const pages=[];for(let i=1;i<=total;i++){const page=await pdf.getPage(i);const vp=page.getViewport({scale:quality});const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;let text='';try{const tc=await page.getTextContent();text=tc.items.map(x=>x.str).join(' ').trim();}catch(e){}pages.push({img:canvas.toDataURL('image/jpeg',0.88),text,pageNum:i});setImpProg(5+(i/total)*80,`Rendering page ${i} of ${total}…`);}setImpProg(88,'Building cards…');const deckId='deck_'+Date.now();const cards=[];if(impLayout==='single'){pages.forEach((p,i)=>cards.push({id:`${deckId}_${i}`,deckId,pageNum:p.pageNum,front:p.img,back:null,text:p.text}));}else{const isAF=impLayout==='paired-af';for(let i=0;i<pages.length;i+=2){const p0=pages[i],p1=pages[i+1]||null;const frontP=isAF?p0:p1,backP=isAF?p1:p0;cards.push({id:`${deckId}_${i}`,deckId,pageNum:p0.pageNum,front:frontP?frontP.img:null,back:backP?backP.img:null,text:(p0.text||'')+' '+(p1?p1.text:''),});}}setImpProg(92,'Saving to storage…');await iBulkPut('cards',cards);const deck={id:deckId,name,cardCount:cards.length,createdAt:Date.now(),previewImage:cards[0]?.front||null};await iPut('decks',deck);const ds={deckId,remaining:shuffle(cards.map(c=>c.id)),drawn:[]};await iPut('drawState',ds);S.drawState[deckId]=ds;S.decks.push(deck);S.currentDeckId=deckId;localStorage.setItem('lastDeckId',deckId);S.history[deckId]=[];setImpProg(100,'Done!');setTimeout(async()=>{closeImportModal();renderDeckSelect();document.getElementById('deck-select').value=deckId;renderLibrary();await loadDeckState();updateDrawView();renderHistory();showToast(`${deck.name} imported — ${cards.length} cards`,'success');},500);}catch(err){console.error(err);showToast('Import failed: '+err.message,'error');goStep(2);}}
function setImpProg(pct,text){document.getElementById('imp-pf').style.width=pct+'%';document.getElementById('imp-pt').textContent=text;}
async function openSplitModal(deckId){splitDeckId=deckId;splitRanges=[];splitCards=[];const deck=S.decks.find(d=>d.id===deckId);document.getElementById('split-deck-name').textContent=deck?deck.name:'';document.getElementById('split-ranges-list').innerHTML='<div class="no-ranges">No ranges yet — add a range and assign page numbers.</div>';document.getElementById('split-confirm-btn').disabled=true;document.getElementById('split-modal').classList.add('open');const grid=document.getElementById('split-card-grid');grid.innerHTML='<div class="empty-state" style="grid-column:1/-1;padding:20px 0"><div class="empty-state-icon" style="font-size:1.5rem">⏳</div><div class="empty-state-title">Loading…</div></div>';splitCards=await iIdx('cards','deckId',deckId);splitCards.sort((a,b)=>a.pageNum-b.pageNum);document.getElementById('split-total').textContent=`(${splitCards.length})`;renderSplitGrid();}
function closeSplitModal(){document.getElementById('split-modal').classList.remove('open');splitDeckId=null;splitCards=[];splitRanges=[];}
function rangeForPage(pnum){return splitRanges.find(r=>{const s=parseInt(r.start)||0,e=parseInt(r.end)||0;return s>0&&e>=s&&pnum>=s&&pnum<=e;})||null;}
function renderSplitGrid(){const grid=document.getElementById('split-card-grid');grid.innerHTML='';splitCards.forEach(card=>{const r=rangeForPage(card.pageNum);const div=document.createElement('div');div.className='split-card-thumb';if(r)div.style.borderColor=r.color;div.innerHTML=`<img src="${card.front}" alt="" loading="lazy"><div class="sc-bar" style="background:${r?r.color:'transparent'}"></div><span class="sc-num">p${card.pageNum}</span>`;const src=card.front;div.onclick=()=>openLightbox(src);grid.appendChild(div);});}
function addSplitRange(){const color=RCOLORS[splitRanges.length%RCOLORS.length];splitRanges.push({id:'r'+Date.now(),name:'',start:'',end:'',color});renderSplitRanges();}
function renderSplitRanges(){const list=document.getElementById('split-ranges-list');if(!splitRanges.length){list.innerHTML='<div class="no-ranges">No ranges yet — add a range and assign page numbers.</div>';document.getElementById('split-confirm-btn').disabled=true;return;}list.innerHTML='';splitRanges.forEach((r,idx)=>{const s=parseInt(r.start)||0,e=parseInt(r.end)||0;const cnt=splitCards.filter(c=>s>0&&e>=s&&c.pageNum>=s&&c.pageNum<=e).length;const div=document.createElement('div');div.className='range-item';div.innerHTML=`<div class="range-header"><div class="range-color-dot" style="background:${r.color}"></div><input class="range-name-input" placeholder="Name this sub-deck (e.g. Illustrations)" value="${esc(r.name)}" oninput="splitRanges[${idx}].name=this.value;validateSplit()"><button class="range-del-btn" onclick="delRange('${r.id}')">✕</button></div><div class="range-fields"><div class="range-field"><div class="range-field-label">From page</div><input type="number" class="range-num-input" min="1" placeholder="1" value="${r.start}" oninput="splitRanges[${idx}].start=this.value;onRangeChange()"></div><div class="range-sep">–</div><div class="range-field"><div class="range-field-label">To page</div><input type="number" class="range-num-input" min="1" placeholder="${splitCards.length||'?'}" value="${r.end}" oninput="splitRanges[${idx}].end=this.value;onRangeChange()"></div></div><div class="range-card-count">${cnt>0?`${cnt} card${cnt!==1?'s':''} in this range`:'Enter a page range above'}</div>`;list.appendChild(div);});validateSplit();}
function delRange(id){splitRanges=splitRanges.filter(r=>r.id!==id);renderSplitRanges();renderSplitGrid();}
function onRangeChange(){renderSplitRanges();renderSplitGrid();}
function validateSplit(){const ok=splitRanges.length>0&&splitRanges.every(r=>r.name.trim()&&parseInt(r.start)>0&&parseInt(r.end)>=parseInt(r.start));document.getElementById('split-confirm-btn').disabled=!ok;}
async function confirmSplit(){const after=document.querySelector('input[name="split-after"]:checked').value;const newDecks=[];for(const r of splitRanges){const s=parseInt(r.start),e=parseInt(r.end);const rCards=splitCards.filter(c=>c.pageNum>=s&&c.pageNum<=e);if(!rCards.length)continue;const nid='deck_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);const nCards=rCards.map((c,i)=>({...c,id:`${nid}_${i}`,deckId:nid}));await iBulkPut('cards',nCards);const ndeck={id:nid,name:r.name,cardCount:nCards.length,createdAt:Date.now(),previewImage:nCards[0]?.front||null};await iPut('decks',ndeck);const ds={deckId:nid,remaining:shuffle(nCards.map(c=>c.id)),drawn:[]};await iPut('drawState',ds);S.drawState[nid]=ds;S.decks.push(ndeck);S.history[nid]=[];newDecks.push(ndeck);}if(after==='delete'){await iDel('decks',splitDeckId);await iDelIdx('cards','deckId',splitDeckId);await iDelIdx('history','deckId',splitDeckId);await iDel('drawState',splitDeckId);S.decks=S.decks.filter(d=>d.id!==splitDeckId);delete S.drawState[splitDeckId];delete S.history[splitDeckId];if(S.currentDeckId===splitDeckId){S.currentDeckId=newDecks.length?newDecks[0].id:(S.decks.length?S.decks[0].id:null);S.currentCard=null;localStorage.setItem('lastDeckId',S.currentDeckId||'');}}if(newDecks.length&&after!=='delete'){S.currentDeckId=newDecks[0].id;localStorage.setItem('lastDeckId',newDecks[0].id);}closeSplitModal();renderDeckSelect();renderLibrary();await loadDeckState();updateDrawView();renderHistory();showToast(`Created ${newDecks.length} sub-deck${newDecks.length!==1?'s':''}!`,'success');}
function switchTab(tab,el){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));document.getElementById('view-'+tab).classList.add('active');el.classList.add('active');}
function openLightbox(src){document.getElementById('lightbox-img').src=src;document.getElementById('lightbox').classList.add('open');}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}
function showToast(msg,type=''){const c=document.getElementById('toast-container');const t=document.createElement('div');t.className='toast'+(type?' '+type:'');t.textContent=msg;c.appendChild(t);setTimeout(()=>t.remove(),3200);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function fmtDate(ts){return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}
const dz=document.getElementById('drop-zone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f&&f.type==='application/pdf'){impFile=f;document.getElementById('drop-zone-text').textContent=f.name;const ni=document.getElementById('import-name');if(!ni.value)ni.value=f.name.replace(/\.pdf$/i,'').replace(/[-_]/g,' ');checkStep1();}});
document.getElementById('import-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeImportModal();});
document.getElementById('split-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSplitModal();});
init();
</script>
</body>
</html>
```

---
