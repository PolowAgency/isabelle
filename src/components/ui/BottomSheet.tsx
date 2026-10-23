"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Clavier ouvert (iPhone surtout) : la zone réellement visible rétrécit sans que la page ne le sache.
  // On colle la feuille au bas de cette zone visible pour que le champ en cours de saisie reste à l'écran.
  const [visible, setVisible] = useState<{ bas: number; hauteur: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const maj = () => setVisible({ bas: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), hauteur: vv.height });
    maj();
    vv.addEventListener("resize", maj);
    vv.addEventListener("scroll", maj);
    return () => {
      vv.removeEventListener("resize", maj);
      vv.removeEventListener("scroll", maj);
      setVisible(null);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6" style={visible ? { bottom: visible.bas } : undefined}>
      <button
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-pine/50 backdrop-blur-[1px]"
      />
      <div
        className="relative bg-card rounded-t-2xl shadow-sheet max-h-[92dvh] flex flex-col animate-slide-up safe-bottom md:w-full md:max-w-lg md:rounded-2xl md:max-h-[85dvh]"
        style={visible ? { maxHeight: Math.round(visible.hauteur * 0.94) } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-center pt-2.5 pb-1 shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-pine/15" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pt-1 pb-3 shrink-0">
            <h2 className="font-serif text-xl font-semibold text-pine">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="p-1.5 rounded-full text-pine/50 hover:bg-pine/5"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
