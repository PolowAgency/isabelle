"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { creerTraitementAction } from "@/app/(app)/actions";

const PASSAGES = [
  { value: "matin", label: "Matin" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
];

const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

export function AjouterTraitementSheet({
  open,
  onClose,
  patientId,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
}) {
  const router = useRouter();
  const [libelle, setLibelle] = useState("");
  const [dosage, setDosage] = useState("");
  const [passages, setPassages] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await creerTraitementAction({ patientId, libelle, dosage, passages, notes });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setLibelle("");
        setDosage("");
        setPassages([]);
        setNotes("");
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d'enregistrer le traitement.");
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nouveau traitement">
      <form onSubmit={handleSubmit} className="grid gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Traitement</span>
          <input
            required
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Lantus, Kardégic, pansement…"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Dosage</span>
          <input
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="12 UI, 75 mg…"
            className={inputClass}
          />
        </label>
        <div>
          <span className="text-sm font-medium text-pine/80">Passages</span>
          <div className="mt-1.5 flex gap-2">
            {PASSAGES.map((p) => {
              const active = passages.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() =>
                    setPassages((cur) => (active ? cur.filter((x) => x !== p.value) : [...cur, p.value]))
                  }
                  className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-pine text-cream" : "border border-line bg-cream text-pine/65"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-2xl border border-line bg-cream px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          />
        </label>
        {error ? <p className="text-sm text-coral">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          Enregistrer le traitement
        </button>
      </form>
    </BottomSheet>
  );
}
