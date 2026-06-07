import { writable } from "svelte/store";

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

export const decks = writable<Deck[]>([]);
export const currentDeckId = writable<string | null>(null);
export const currentCard = writable<Card | null>(null);
export const drawState = writable<Record<string, DrawState>>({});
export const history = writable<Record<string, HistoryEntry[]>>({});
export const cardFlipped = writable<boolean>(false);
export const showText = writable<boolean>(false);
export const lightboxSrc = writable<string | null>(null);
export const activeTab = writable<string>("draw");
export const importModalOpen = writable<boolean>(false);
export const splitDeckId = writable<string | null>(null);

export const STORAGE_KEYS = {
  lastDeckId: "lastDeckId",
};
