export interface Toast {
  id: string;
  message: string;
  type: string;
}

export const toasts = $state<Toast[]>([]);

export function showToast(message: string, type: string = ""): void {
  const id = Date.now() + Math.random().toString(36).slice(2, 7);
  toasts.push({ id, message, type });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index !== -1) {
      toasts.splice(index, 1);
    }
  }, 3200);
}
