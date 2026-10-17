"use client";

import { INFOS_TRANCHE, TRANCHES, type Tranche } from "@/lib/tranches";
import type { CelluleGrille } from "@/lib/agenda";
import type { EtatCharge } from "@/lib/planning-calc";
import { formaterDuree } from "@/lib/planning-calc";

const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"] as const;

// Charge d'une case rapportée à la capacité d'une tranche (par infirmière).
const FOND: Record<EtatCharge, string> = {
  vide: "bg-transparent text-pine/20",
  ok: "bg-sage/30 text-pine",
  proche: "bg-statut-reportee/25 text-statut-reportee",
  depasse: "bg-statut-absent text-white",
};

const LIBELLE: Record<EtatCharge, string> = {
  vide: "aucune visite",
  ok: "charge normale",
  proche: "proche de la capacité",
  depasse: "capacité dépassée",
};

function numeroJour(iso: string) {
  return Number(iso.slice(8, 10));
}

/**
 * Grille jours × tranches de la semaine (7 colonnes qui se partagent la largeur : jamais de défilement
 * horizontal). Chaque case affiche le nombre de patients, colorée selon la charge ; un appui sélectionne
 * ce jour et cette tranche. Les absences de l'équipe figurent en tête de colonne.
 */
export function GrilleSemaine({
  jours,
  grille,
  aujourdhui,
  absencesParJour,
  jourSelectionne,
  trancheSelectionnee,
  onSelectionner,
}: {
  /** Jours dans l'ordre lundi → dimanche. */
  jours: string[];
  grille: CelluleGrille[][];
  aujourdhui: string;
  /** Nombre de personnes absentes chaque jour (même ordre que `jours`). */
  absencesParJour: number[];
  jourSelectionne: string;
  trancheSelectionnee: Tranche | null;
  onSelectionner: (jour: string, tranche: Tranche) => void;
}) {
  return (
    <div
      role="grid"
      aria-label="Charge de la semaine par jour et par tranche"
      className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] gap-1"
    >
      <div role="row" className="contents">
        <span role="columnheader" className="block">
          <span className="sr-only">Tranche</span>
        </span>
        {jours.map((jour, i) => (
          <span
            key={jour}
            role="columnheader"
            className={`flex flex-col items-center rounded-lg py-1 text-[10px] font-semibold leading-tight ${
              jour === aujourdhui ? "bg-coral text-white" : "text-pine/60"
            }`}
          >
            {JOURS_COURTS[i]}
            <span className="text-[11px]">{numeroJour(jour)}</span>
            {absencesParJour[i] > 0 && (
              <span
                className="mt-0.5 whitespace-nowrap rounded-full bg-statut-reportee px-1 text-[9px] font-bold leading-snug text-white"
                title={`${absencesParJour[i]} absente${absencesParJour[i] > 1 ? "s" : ""}`}
                aria-label={`${absencesParJour[i]} absente${absencesParJour[i] > 1 ? "s" : ""}`}
              >
                {absencesParJour[i]} abs.
              </span>
            )}
          </span>
        ))}
      </div>

      {TRANCHES.map((tranche, t) => (
        <div key={tranche} role="row" className="contents">
          <span role="rowheader" className="flex items-center text-[10px] font-semibold leading-none text-pine/50">
            {INFOS_TRANCHE[tranche].label.replace("h–", "-").replace("h", "")}
          </span>
          {grille[t].map((cellule) => {
            const selection = cellule.jour === jourSelectionne && tranche === trancheSelectionnee;
            return (
              <button
                key={cellule.jour}
                type="button"
                role="gridcell"
                onClick={() => onSelectionner(cellule.jour, tranche)}
                aria-label={`${cellule.jour}, ${INFOS_TRANCHE[tranche].label} : ${cellule.nombre} patient${cellule.nombre > 1 ? "s" : ""}${
                  cellule.nombre > 0 ? `, ${formaterDuree(cellule.dureeMin)}` : ""
                }, ${LIBELLE[cellule.etat]}`}
                aria-selected={selection}
                className={`flex h-9 min-w-0 items-center justify-center rounded-lg text-sm font-semibold ${FOND[cellule.etat]} ${
                  selection ? "ring-2 ring-pine" : ""
                }`}
              >
                {cellule.nombre > 0 ? cellule.nombre : "·"}
              </button>
            );
          })}
        </div>
      ))}

      <p className="col-span-full mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-pine/55">
        <Legende classe={FOND.ok} texte="normale" />
        <Legende classe={FOND.proche} texte="proche de la capacité" />
        <Legende classe={FOND.depasse} texte="dépassée" />
      </p>
    </div>
  );
}

function Legende({ classe, texte }: { classe: string; texte: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded ${classe}`} aria-hidden />
      {texte}
    </span>
  );
}
