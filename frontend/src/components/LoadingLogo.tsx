import { Shield } from "lucide-react";

export type LoadingScope = "fullscreen" | "page" | "container" | "inline";
export type LoadingSize = "sm" | "md" | "lg";

interface LoadingLogoProps {
  scope?: LoadingScope;
  size?: LoadingSize;
  message?: string;
  className?: string;
}

export function LoadingLogo({
  scope = "container",
  size = "md",
  message,
  className = "",
}: LoadingLogoProps) {
  const sizeMap = {
    sm: {
      ring: "h-10 w-10",
      logoBox: "h-7 w-7",
      icon: "h-4 w-4",
      text: "text-xs",
    },
    md: {
      ring: "h-16 w-16",
      logoBox: "h-11 w-11",
      icon: "h-6 w-6",
      text: "text-sm",
    },
    lg: {
      ring: "h-24 w-24",
      logoBox: "h-16 w-16",
      icon: "h-8 w-8",
      text: "text-base font-medium",
    },
  }[size];

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      {/* Outer animated brand ring & logo container */}
      <div className="relative flex items-center justify-center">
        {/* Subtle rotating gold/yellow accent ring */}
        <div
          className={`absolute rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin ${sizeMap.ring}`}
        />

        {/* Pulsing halo */}
        <div
          className={`absolute rounded-full bg-brand-500/10 animate-ping opacity-30 ${sizeMap.ring}`}
        />

        {/* Logo container: holds the user's logo image */}
        <div
          className={`relative z-10 flex items-center justify-center rounded-xl bg-white p-1.5 shadow-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 ${sizeMap.logoBox}`}
        >
          {/* Logo image tag with blank src as requested for user to populate */}
          <img
            src=""
            alt="UMB Logo"
            className="max-h-full max-w-full object-contain select-none"
            onError={(e) => {
              // Hide broken image placeholder when src is blank
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
          {/* Graceful emblem fallback visible while src is blank */}
          <Shield className={`text-brand-600 dark:text-brand-500 ${sizeMap.icon}`} />
        </div>
      </div>

      {/* Message and pulsing dots */}
      {message && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className={sizeMap.text}>{message}</span>
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce" />
          </span>
        </div>
      )}
    </div>
  );

  if (scope === "fullscreen") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
        <div className="rounded-2xl bg-white/95 dark:bg-slate-900/95 p-6 shadow-xl border border-slate-200 dark:border-slate-800">
          {content}
        </div>
      </div>
    );
  }

  if (scope === "page") {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center py-16">
        {content}
      </div>
    );
  }

  if (scope === "inline") {
    return (
      <div className="inline-flex items-center gap-2 py-1">
        <div className="relative flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
          <div className="absolute h-3.5 w-3.5 flex items-center justify-center rounded bg-white dark:bg-slate-800">
            <img
              src=""
              alt="Logo"
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
        </div>
        {message && <span className="text-xs text-slate-500 dark:text-slate-400">{message}</span>}
      </div>
    );
  }

  // default: container (fits inside a card, table, modal, or section)
  return (
    <div className="flex w-full items-center justify-center py-8">
      {content}
    </div>
  );
}
