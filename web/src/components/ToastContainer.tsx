import { useToast } from '../context/ToastContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className="flex items-center gap-3 bg-brand-900 text-white px-4 py-3 rounded-2xl shadow-lg min-w-[260px]">
          <span className="flex-1 text-sm">{t.message}</span>
          {t.withReload && (
            <button onClick={() => window.location.reload()}
              className="text-brand-300 text-sm font-semibold hover:text-white whitespace-nowrap">
              Reload
            </button>
          )}
          <button onClick={() => removeToast(t.id)} className="text-brand-400 hover:text-white ml-1 text-lg leading-none">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
