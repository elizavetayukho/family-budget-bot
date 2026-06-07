
import { useToast } from '../context/ToastContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg min-w-[260px]"
        >
          <span className="flex-1 text-sm">{t.message}</span>
          {t.withReload && (
            <button
              onClick={() => window.location.reload()}
              className="text-blue-300 text-sm font-medium hover:text-blue-200 whitespace-nowrap"
            >
              Reload
            </button>
          )}
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-400 hover:text-white ml-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
