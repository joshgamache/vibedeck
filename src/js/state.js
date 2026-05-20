import { writable } from "svelte/store";

export const decks = writable([]);
export const currentDeckId = writable(null);
export const currentCard = writable(null);
export const drawState = writable({});
export const history = writable({});
export const cardFlipped = writable(false);
export const showText = writable(false);
export const lightboxSrc = writable(null);
export const activeTab = writable("draw");
export const importModalOpen = writable(false);
export const splitDeckId = writable(null);

export const STORAGE_KEYS = {
  lastDeckId: "lastDeckId",
};
