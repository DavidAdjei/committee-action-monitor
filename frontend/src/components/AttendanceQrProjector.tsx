import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Full-screen attendance QR for projection during a live meeting.
 */
export function AttendanceQrProjector({
  meetingTitle,
  meetingReference,
  checkInUrl,
  onClose,
}: {
  meetingTitle: string;
  meetingReference: string;
  checkInUrl: string;
  onClose: () => void;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(checkInUrl)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Prefer landscape-friendly dark stage for projectors
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Attendance QR code"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        title="Close (Esc)"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-400">Scan to mark attendance</p>
      <h2 className="mb-1 max-w-3xl px-6 text-center text-2xl font-bold sm:text-3xl md:text-4xl">{meetingTitle}</h2>
      <p className="mb-8 text-base text-slate-400">{meetingReference}</p>

      <div className="rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <img
          src={qrSrc}
          alt="Meeting attendance QR code"
          className="h-[min(70vw,480px)] w-[min(70vw,480px)]"
        />
      </div>

      <p className="mt-8 max-w-lg px-6 text-center text-sm text-slate-400">
        Open the Committee Action Monitor on your device, sign in, then scan this code to record your attendance.
      </p>
      <p className="mt-3 text-xs text-slate-500">Press Esc or the × button when finished</p>
    </div>
  );
}
