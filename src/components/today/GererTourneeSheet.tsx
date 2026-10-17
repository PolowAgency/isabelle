"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { lundiDe } from "@/lib/date";
import { dupliquerJourAction, genererSemaineSuivanteAction } from "@/app/(app)/actions";

export function GererTourneeSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState(date);
  const [target, setTarget] = useState("");
  const [semaineRef, setSemaineRef] = useState(lundiDe(date));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleCopierJour() {
    if (!target) return;
    startTransition(async () => {
      const res = await dupliquerJourAction(source, target);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(`Tournée du ${source} copiée vers le ${target} (${res.data.copiees} visite${res.data.copiees > 1 ? "s" : ""}).`);
      router.refresh();
    });
  }

  function handleGenererSemaine() {
    startTransition(async () => {
      const res = await genererSemaineSuivanteAction(semaineRef);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setMessage(`Semaine suivante générée à partir du modèle (${res.data.copiees} visite${res.data.copiees > 1 ? "s" : ""}).`);
      router.refresh();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Gérer la tournée">
      <div className="flex flex-col gap-6 pb-2">
        {message && (
          <div className="rounded-xl bg-statut-faite/10 border border-statut-faite/30 text-statut-faite text-sm px-3 py-2">
            {message}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-pine">Copier un jour de tournée</p>
          <div className="flex items-center gap-2">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-pine/50">Depuis</span>
              <input
                type="date"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="rounded-xl border border-line px-3 py-2 text-sm bg-white"
              />
            </label>
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-pine/50">Vers</span>
              <input
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-xl border border-line px-3 py-2 text-sm bg-white"
              />
            </label>
          </div>
          <button
            onClick={handleCopierJour}
            disabled={pending || !target}
            className="bg-pine text-cream font-medium rounded-xl py-2.5 text-sm disabled:opacity-50"
          >
            Copier ce jour
          </button>
        </div>

        <div className="flex flex-col gap-2.5 pt-2 border-t border-line">
          <p className="text-sm font-semibold text-pine">Générer la semaine suivante</p>
          <p className="text-xs text-pine/50">
            Duplique toute la semaine du modèle choisi (+7 jours), pour éviter de recréer chaque visite à la main.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-pine/50">Semaine modèle (n&apos;importe quel jour de cette semaine)</span>
            <input
              type="date"
              value={semaineRef}
              onChange={(e) => setSemaineRef(lundiDe(e.target.value))}
              className="rounded-xl border border-line px-3 py-2 text-sm bg-white"
            />
          </label>
          <button
            onClick={handleGenererSemaine}
            disabled={pending}
            className="bg-coral text-white font-medium rounded-xl py-2.5 text-sm disabled:opacity-50"
          >
            Générer la semaine suivante
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
