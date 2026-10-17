"use client";

import { formaterDuree } from "@/lib/planning-calc";

/**
 * Durée prévue d'une visite, en minutes. Pré-remplie avec la somme des durées des actes ;
 * dès que l'infirmière la modifie, sa valeur est conservée telle quelle.
 */
export function DureeField({
  calculee,
  valeur,
  onChange,
}: {
  /** Somme des durées des actes (null = aucun acte). */
  calculee: number | null;
  /** Valeur saisie à la main, ou null tant que la durée suit les actes. */
  valeur: number | null;
  onChange: (valeur: number | null) => void;
}) {
  const affichee = valeur ?? calculee;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-pine/80">Durée prévue</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          value={affichee ?? ""}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(1, Math.min(600, Math.round(Number(e.target.value)))))}
          aria-label="Durée prévue en minutes"
          className="h-11 w-24 rounded-xl border border-line bg-white px-3 text-center text-sm focus:outline-none focus:ring-2 focus:ring-coral"
        />
        <span className="text-sm text-pine/60">min</span>
        {valeur !== null && calculee !== null && valeur !== calculee && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-coral">
            Revenir à {formaterDuree(calculee)} (somme des actes)
          </button>
        )}
      </div>
    </div>
  );
}
