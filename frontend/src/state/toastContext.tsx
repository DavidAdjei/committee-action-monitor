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
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-400" />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case "error":
        return "bg-red-900 text-red-50";
      case "info":
        return "bg-blue-900 text-blue-50";
      case "success":
      default:
        return "bg-slate-900 text-white";
    }
  };

  return (
    <ToastContext.Provider value={flash}>
      {children}
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${getStyles(t.type)}`}
          >
            {getIcon(t.type)}
            {t.message}
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 text-xs opacity-70 hover:opacity-100"
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
