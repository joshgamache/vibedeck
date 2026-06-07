import { writable } from "svelte/store";

export interface Toast {
  id: string;
  message: string;
  type: string;
}

export const toasts = writable<Toast[]>([]);

export function showToast(message: string, type: string = ""): void {
  const id = Date.now() + Math.random().toString(36).slice(2, 7);
  toasts.update((list) => [...list, { id, message, type }]);
  setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, 3200);
}
