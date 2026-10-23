import { createContext } from 'react';

export type ToastVariant = 'success' | 'error';

export type ToastInput = {
  message: string;
  variant: ToastVariant;
};

export type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
