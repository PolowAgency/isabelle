"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { enregistrerReglagesPlanningAction } from "@/app/(app)/actions";
import { DUREES_PAR_DEFAUT, formaterDuree } from "@/lib/planning-calc";

const inputClass =
  "h-12 w-24 rounded-2xl border border-line bg-cream px-3 text-center text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

export function ReglagesPlanningForm({
  actes,
  capaciteInitiale,
}: {
  actes: { value: string; label: string; dureeMin: number }[];
  capaciteInitiale: number;
}) {
  const [durees, setDurees] = useState<Record<string, string>>(
    Object.fromEntries(actes.map((a) => [a.value, String(a.dureeMin)]))
  );
  const [capacite, setCapacite] = useState(String(capaciteInitiale));
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function enregistrer(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await enregistrerReglagesPlanningAction({
          durees: Object.fromEntries(Object.entries(durees).map(([acte, v]) => [acte, Number(v)])),
          capaciteTrancheMin: Number(capacite),
        });
        setMessage(res.ok ? { texte: "Réglages enregistrés.", ok: true } : { texte: res.error, ok: false });
      } catch {
        setMessage({ texte: "Pas de réseau : réglages non enregistrés.", ok: false });
      }
    });
  }

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-4">
      <div className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">Durée par acte</h2>
        <div className="grid gap-3">
          {actes.map((acte) => (
            <label key={acte.value} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-pine/80">
                {acte.label}
                <span className="block text-xs font-normal text-pine/45">
                  par défaut {formaterDuree(DUREES_PAR_DEFAUT[acte.value] ?? 15)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-pine/60">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={480}
                  required
                  value={durees[acte.value]}
                  onChange={(e) => setDurees((d) => ({ ...d, [acte.value]: e.target.value }))}
                  className={inputClass}
                />
                min
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">Capacité d&apos;une tranche</h2>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-pine/80">
            Temps de soin maximum par tranche et par infirmière
            <span className="block text-xs font-normal text-pine/45">par défaut 2 h</span>
          </span>
          <span className="flex items-center gap-2 text-sm text-pine/60">
            <input
              type="number"
              inputMode="numeric"
              min={15}
              max={720}
              required
              value={capacite}
              onChange={(e) => setCapacite(e.target.value)}
              className={inputClass}
            />
            min
          </span>
        </label>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-statut-faite" : "text-coral"}`}>
          {message.texte}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
        Enregistrer
      </button>
    </form>
  );
}
