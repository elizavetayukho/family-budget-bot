import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface Toast {
  id: number;
  message: string;
  withReload?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, withReload?: boolean) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType>(null!);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, withReload = false) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, withReload }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
