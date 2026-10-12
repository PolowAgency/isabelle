"use client";

import { useEffect } from "react";

export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 5000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return (
    <div className="fixed left-4 right-4 bottom-24 z-50 flex items-center justify-between gap-3 bg-pine text-cream rounded-xl shadow-lg px-4 py-3 animate-slide-up">
      <span className="text-sm">{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={() => {
            onAction();
            onDismiss();
          }}
          className="text-coral font-semibold text-sm shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
