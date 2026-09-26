import { create } from 'zustand';

export type ToastTone = 'default' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'default') => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    window.setTimeout(() => get().dismiss(id), tone === 'error' ? 5200 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function toast(message: string, tone?: ToastTone) {
  useToastStore.getState().push(message, tone);
}
