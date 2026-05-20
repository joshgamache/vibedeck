import { writable } from "svelte/store";

export const toasts = writable([]);

export function showToast(message, type = "") {
  const id = Date.now() + Math.random().toString(36).slice(2, 7);
  toasts.update((list) => [...list, { id, message, type }]);
  setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, 3200);
}
