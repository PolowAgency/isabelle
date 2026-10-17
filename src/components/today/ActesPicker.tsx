"use client";

import { ACTES } from "@/lib/actes";

/** Puces de sélection d'actes (plusieurs possibles). Réutilisé à la création, à la modification et à la validation. */
export function ActesPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (actes: string[]) => void;
}) {
  // Actes déjà présents mais hors liste (saisie libre, anciennes données) : on les garde visibles.
  const extras = value.filter((a) => !ACTES.some((x) => x.value === a));

  function toggle(acte: string) {
    onChange(value.includes(acte) ? value.filter((a) => a !== acte) : [...value, acte]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {[...ACTES, ...extras.map((a) => ({ value: a, label: a }))].map((a) => (
        <button
          key={a.value}
          type="button"
          onClick={() => toggle(a.value)}
          aria-pressed={value.includes(a.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            value.includes(a.value) ? "bg-coral text-white border-coral" : "border-line text-pine/60"
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
