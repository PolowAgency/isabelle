"use client";

import {
  INFOS_TRANCHE,
  PASSAGES,
  PASSAGE_LABELS,
  tranchesDuPassage,
  type Tranche,
} from "@/lib/tranches";

/**
 * Choix de tranche(s) horaire(s), groupées matin / midi / soir.
 * `multiple` : plusieurs tranches pour la même journée (créations) ; sinon une seule (déplacement).
 */
export function TranchesPicker({
  value,
  onChange,
  multiple = false,
}: {
  value: Tranche[];
  onChange: (tranches: Tranche[]) => void;
  multiple?: boolean;
}) {
  function toggle(tranche: Tranche) {
    if (!multiple) return onChange([tranche]);
    onChange(value.includes(tranche) ? value.filter((t) => t !== tranche) : [...value, tranche]);
  }

  return (
    <div className="flex flex-col gap-2">
      {PASSAGES.map((passage) => (
        <div key={passage} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-pine/40">
            {PASSAGE_LABELS[passage]}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tranchesDuPassage(passage).map((tranche) => {
              const actif = value.includes(tranche);
              return (
                <button
                  key={tranche}
                  type="button"
                  onClick={() => toggle(tranche)}
                  aria-pressed={actif}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    actif ? "bg-pine text-cream border-pine" : "border-line text-pine/60 bg-white"
                  }`}
                >
                  {INFOS_TRANCHE[tranche].label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
