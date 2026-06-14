export interface Deck {
  id: string;
  name: string;
  cardCount: number;
  createdAt: number;
  previewImage: string; // jpeg dataURL
}

export interface Card {
  id: string;
  deckId: string;
  pageNum: number;
  front: string; // jpeg dataURL
  back: string | null; // jpeg dataURL
  text: string;
  annotations?: string[];
}

export interface DrawState {
  deckId: string;
  remaining: string[]; // cardId array
  drawn: string[]; // cardId array
}

export interface HistoryEntry {
  id?: number;
  deckId: string;
  cardId: string;
  drawnAt: number;
  card?: Card;
}

class AppState {
  decks = $state<Deck[]>([]);
  currentDeckId = $state<string | null>(null);
  currentCard = $state<Card | null>(null);
  drawState = $state<Record<string, DrawState>>({});
  history = $state<Record<string, HistoryEntry[]>>({});
  cardFlipped = $state<boolean>(false);
  showText = $state<boolean>(false);
  lightboxSrc = $state<string | null>(null);
  activeTab = $state<string>("draw");
  importModalOpen = $state<boolean>(false);
  splitDeckId = $state<string | null>(null);
}

export const appState = new AppState();

export const STORAGE_KEYS = {
  lastDeckId: "lastDeckId",
};
