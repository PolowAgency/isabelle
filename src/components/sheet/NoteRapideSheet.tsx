"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Mic, MicOff, Send } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useDictation } from "@/hooks/useDictation";

export function NoteRapideSheet({
  open,
  onClose,
  patientLabel,
  title = "Note rapide",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  patientLabel?: string;
  title?: string;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const { supported, listening, toggle } = useDictation((text) =>
    setNote((current) => (current ? `${current} ${text}` : text))
  );

  function handleSubmit() {
    if (!note.trim()) return;

    startTransition(async () => {
      await onSubmit(note.trim());
      setNote("");
      onClose();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {patientLabel ? (
          <p className="text-sm text-pine/55">{patientLabel}</p>
        ) : null}

        <div className="relative">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={6}
            placeholder="Saisir ou dicter une note..."
            className="w-full rounded-2xl border border-line bg-card px-4 py-3 pr-14 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          />

          {supported ? (
            <button
              type="button"
              onClick={toggle}
              className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full ${
                listening ? "bg-coral text-white" : "bg-pine/10 text-pine"
              }`}
              aria-label={listening ? "Arreter la dictee" : "Dicter"}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
          Enregistrer
        </button>
      </div>
    </BottomSheet>
  );
}
