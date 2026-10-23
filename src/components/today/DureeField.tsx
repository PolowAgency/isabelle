"use client";

import { useState } from "react";
import { DUREE_MIN_VISITE } from "@/lib/planning-calc";

const MAX = 600;

/**
 * Durée prévue d'une visite, en minutes (5 minutes au minimum). Pré-remplie avec la somme des durées
 * des actes ; dès que l'infirmière la modifie, sa valeur est conservée telle quelle. La saisie en cours
 * n'est ramenée au minimum qu'en quittant le champ (on peut taper « 30 » sans être coupé à « 3 »). Champ vidé = la durée suit de nouveau les actes.
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
  const [saisie, setSaisie] = useState<string | null>(null);
  const affichee = saisie ?? String(valeur ?? calculee ?? "");

  function pendantSaisie(texte: string) {
    setSaisie(texte);
    const n = Math.round(Number(texte));
    if (texte !== "" && n >= DUREE_MIN_VISITE && n <= MAX) onChange(n);
  }

  function finSaisie() {
    if (saisie === null) return;
    const texte = saisie;
    setSaisie(null);
    if (texte === "") return onChange(null);
    const n = Math.round(Number(texte));
    onChange(Math.max(DUREE_MIN_VISITE, Math.min(MAX, Number.isFinite(n) ? n : DUREE_MIN_VISITE)));
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-pine/80">Durée prévue</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={DUREE_MIN_VISITE}
          max={MAX}
          value={affichee}
          placeholder="—"
          onChange={(e) => pendantSaisie(e.target.value)}
          onBlur={finSaisie}
          aria-label="Durée prévue en minutes"
          className="h-11 w-24 rounded-xl border border-line bg-white px-3 text-center text-base focus:outline-none focus:ring-2 focus:ring-coral"
        />
        <span className="text-sm text-pine/60">min</span>
      </div>
      <p className="mt-1 text-xs text-pine/45">Minimum {DUREE_MIN_VISITE} min.</p>
    </div>
  );
}
