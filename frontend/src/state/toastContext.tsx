import { ReactNode, createContext, useContext } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useNotificationStore } from "./notificationStore";

const ToastContext = createContext<((message: string, type?: "success" | "error") => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const toasts = useNotificationStore((state) => state.toasts);
  const addToast = useNotificationStore((state) => state.addToast);
  const removeToast = useNotificationStore((state) => state.removeToast);

  const flash = (message: string, type: "success" | "error" = "success") => {
    addToast(message, type, 2800);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />;
      case "error":
        return <AlertCircle className="h-4 w-4 shrink-0 text-red-200" aria-hidden />;
      case "info":
      default:
        return <Info className="h-4 w-4 shrink-0 text-sky-200" aria-hidden />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case "error":
        return "bg-red-900 text-red-50 border border-red-700";
      case "info":
        return "bg-slate-800 text-slate-50 border border-slate-600 dark:bg-slate-800";
      case "success":
      default:
        return "bg-slate-900 text-white border border-slate-700 dark:bg-slate-800 dark:border-slate-600";
    }
  };

  return (
    <ToastContext.Provider value={flash}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[min(100%-2rem,24rem)] -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${getStyles(t.type)}`}
          >
            {getIcon(t.type)}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-xs opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useFlash(): (message: string, type?: "success" | "error") => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useFlash must be used inside <ToastProvider>");
  return ctx;
}
