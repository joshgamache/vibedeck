# Vibedeck (The Deck) — Project Rules & Guidelines

This file is configured for compatibility with Gemini CLI. It aligns with `.antigravityrules`.

---

## 1. Project Overview & Context

**Vibedeck (The Deck)** is a portable digital card reader optimized for Monte Cook Games (MCG) decks (Cypher Deck, Weird Deck, GM Intrusion Deck, etc.).

- **Operation**: Runs entirely client-side in the browser. Supports offline use.
- **Goal**: Enable GMs and players to digitally manage decks, draw cards with 3D flip animations, split PDF imports into custom sub-decks, and share drawn cards across a local network with zero server configuration.

---

## 2. Core Tech Stack

- **Framework**: Svelte 5 (utilizing Svelte runes: `$state`, `$derived`, `$effect`, and the new `mount` syntax).
- **Build Tool**: Vite (configured with relative asset paths for static deployments).
- **Package Manager**: `pnpm` (use `pnpm` for installing packages and running scripts).
- **Styling**: Vanilla CSS (no CSS frameworks like Tailwind CSS, unless explicitly requested).
- **Database**: IndexedDB (`db.js`) for storing raw decks, cards, history, and current draw states.
- **Local Network Sharing**: WebRTC PeerJS (`sync.js` / `peerjs`) for peer-to-peer data channel connections, and QR Code (`qrcode`) canvas rendering for easy joining.
- **Import Engine**: PDF.js (configured via CDN/local assets) to extract text and render PDF pages to JPEG data-URLs.
- **Linter & Formatter**: `oxlint` and `oxfmt`.

---

## 3. Directory Layout & Structure

```
├── .antigravityrules     # Primary AI instructions file
├── GEMINI.md             # This file (Gemini CLI fallback rules)
├── .geminiignore         # Ignore rules for LLM agents
├── package.json          # Dependency definition
├── vite.config.js        # Vite build configuration (base: "./")
├── svelte.config.js      # Svelte configuration file
├── src/
│   ├── main.js           # Svelte mount entrypoint
│   ├── App.svelte        # Application entrypoint & view coordinator
│   ├── components/       # Svelte UI Components
│   │   ├── DrawView.svelte      # Core card drawing interface & GM sharing panel
│   │   ├── LibraryView.svelte   # Manage imported decks (split/delete actions)
│   │   ├── ImportModal.svelte   # 3-step PDF importing wizard
│   │   ├── SplitModal.svelte    # Deck splitter interface by page ranges
│   │   ├── TableView.svelte     # WebRTC session hosting/joining UI
│   │   ├── HistoryView.svelte   # Log of drawn cards
│   │   ├── Lightbox.svelte      # Fullscreen image viewer modal
│   │   └── ToastContainer.svelte # Floating notification toasts
│   ├── css/              # Structured Vanilla CSS
│   │   ├── variables.css        # Global CSS variables & design tokens
│   │   ├── base.css             # Base reset & typography styles
│   │   ├── components/          # Component-specific stylesheets
│   │   └── views/               # View-specific stylesheets
│   └── js/               # Shared JavaScript utilities
│       ├── db.js                # IndexedDB wrapper and operations
│       ├── state.js             # Global Svelte 5 app state
│       ├── sync.js              # WebRTC sync orchestration using PeerJS
│       ├── toastStore.js        # Svelte toast management store
│       └── utils.js             # General helper functions
```

---

## 4. Design Foundations (Vanilla CSS)

We use a premium, immersive **dark "ancient technology" / sci-fantasy theme**:

- **Fonts**: `Cinzel` for headings and display elements; `Crimson Pro` for readable body copy.
- **Colors**: Deep slates/purples for backgrounds (`--bg`, `--bg2`), accented by glowing gold/amber (`--amber`, `--amber2`).
- **Aesthetic Accents**: Subtle noise texture overlay, smooth micro-animations, 3D card flipping transitions.
- **Rules**:
  1. DO NOT install Tailwind CSS. Write standard, modular CSS inside `src/css/`.
  2. Use predefined CSS variables from `src/css/variables.css`.
  3. Ensure all user-facing interface elements feel premium, animated, and tactile.

---

## 5. Data Model (IndexedDB - `db.js`)

The app uses `the-deck-v1` IndexedDB database with four main object stores:

- **`decks`**: Keyed by `id` (UUID string).
  ```typescript
  { id: string, name: string, cardCount: number, createdAt: number, previewImage: string /* jpeg dataURL */ }
  ```
- **`cards`**: Keyed by `id` (UUID string), indexed by `deckId`.
  ```typescript
  { id: string, deckId: string, pageNum: number, front: string /* jpeg dataURL */, back: string | null /* jpeg dataURL */, text: string }
  ```
- **`drawState`**: Keyed by `deckId`. Manages randomized draw queues.
  ```typescript
  { deckId: string, remaining: string[] /* cardId array */, drawn: string[] /* cardId array */ }
  ```
- **`history`**: Auto-increment `id`, indexed by `deckId`. Log of drawn cards.
  ```typescript
  { id: number, deckId: string, cardId: string, drawnAt: number }
  ```

---

## 6. WebRTC Card Sharing Protocol (`sync.js`)

Direct local-network card sharing is built on **PeerJS**:

- **Role Assignment**: One client hosts (Host/GM room), other clients join (Players).
- **Handshake**: Initiated using a 6-digit Room Code via a PeerJS signaling server.
- **QR Code**: Joining players scan a custom canvas-rendered QR Code.
- **Transmission**: Cards are pushed as full JSON payloads (including base64 images). Players do NOT need the PDF deck imported locally; they receive cards dynamically.
- **Targeting**: The Host can broadcast to all players, or target a player's private hand drawer.

---

## 7. Developer Commands & Workflows

Always run scripts using `pnpm`:

- **Development Server**: `pnpm run dev` (starts Vite dev server)
- **Production Build**: `pnpm run build` (outputs to `./dist`)
- **Linting check**: `pnpm run lint` (runs oxlint check)
- **Linting auto-fix**: `pnpm run lint:fix` (runs oxlint with auto-fix)
- **Formatting check**: `pnpm run fmt:check` (runs oxfmt check)
- **Formatting auto-apply**: `pnpm run fmt` (runs oxfmt formatter)

---

## 8. Deployment Strategy

- Vibedeck is compiled to a static SPA inside the `/dist` folder.
- **Pathing**: Assets must be resolved relatively (`base: "./"`) so that the application runs directly from a local index.html or under sub-paths (such as GitHub Pages deployment).

---

## 9. AI Development Rules & Constraints

1. **Maintain Code Style**: Write modern Svelte 5 code using standard runes (`$state`, `$derived`, `$effect`).
2. **CSS Rule**: Only edit styles in `src/css/` files. Never inline complex style attributes. Maintain the dark sci-fantasy theme.
3. **Run Checks**: After modifying files, run `pnpm run lint:fix` and `pnpm run fmt` to verify formatting and linting.
4. **Documentation**: Retain existing docstrings and code comments unless explicitly updating them.
5. **Base Paths**: Do not change the relative base URL config in Vite configuration.
