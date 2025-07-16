import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  autoClose?: boolean;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastState>()(
  devtools(
    (set, get) => ({
      toasts: [],

      addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = {
          id,
          duration: 5000,
          autoClose: true,
          ...toast,
        };

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto-remove toast after duration
        if (newToast.autoClose && newToast.duration) {
          setTimeout(() => {
            get().removeToast(id);
          }, newToast.duration);
        }

        return id;
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
      },

      clearAll: () => {
        set({ toasts: [] });
      },
    }),
    { name: 'toast-store' }
  )
);

// Convenience functions for different toast types
export const toast = {
  success: (title: string, message?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'success',
      title,
      message,
      ...options,
    });
  },

  error: (title: string, message?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'error',
      title,
      message,
      duration: 7000, // Errors stay longer
      ...options,
    });
  },

  warning: (title: string, message?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'warning',
      title,
      message,
      ...options,
    });
  },

  info: (title: string, message?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'info',
      title,
      message,
      ...options,
    });
  },
};