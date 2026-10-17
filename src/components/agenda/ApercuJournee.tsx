"use client";

import { Plus } from "lucide-react";
import { INFOS_TRANCHE, etatTranche, type EtatTranche, type Tranche } from "@/lib/tranches";
import { etatCharge, formaterDuree, type AgregatTranche } from "@/lib/planning-calc";

// Mêmes codes couleur que la timeline de la tournée (terminée / en cours / en retard / à venir).
const COULEURS: Record<EtatTranche, { fond: string; point: string; texte: string; libelle: string }> = {
  terminee: { fond: "bg-statut-faite/10", point: "bg-statut-faite", texte: "text-statut-faite", libelle: "Terminée" },
  en_cours: { fond: "bg-coral/10 ring-1 ring-coral/40", point: "bg-coral", texte: "text-coral", libelle: "En cours" },
  en_retard: { fond: "bg-statut-absent/10", point: "bg-statut-absent", texte: "text-statut-absent", libelle: "En retard" },
  a_venir: { fond: "bg-pine/5", point: "bg-pine/25", texte: "text-pine/55", libelle: "À venir" },
};

/**
 * Bandeau compact des 8 tranches de la journée : patients, temps prévu, progression et état.
 * Un appui sur une tranche remplie fait défiler jusqu'à ses visites ; sur une tranche vide, propose
 * d'y ajouter une visite. Présentationnel : sert à la tournée et au mode hors-ligne.
 */
export function ApercuJournee({
  tranches,
  heure,
  capaciteMin,
  onVoir,
  onAjouter,
}: {
  tranches: AgregatTranche[];
  /** Heure décimale à Paris, ou null pour un autre jour que le jour courant. */
  heure: number | null;
  capaciteMin: number;
  onVoir: (tranche: Tranche) => void;
  onAjouter?: (tranche: Tranche) => void;
}) {
  return (
    <nav aria-label="Aperçu de la journée">
      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {tranches.map((t) => {
          const { label } = INFOS_TRANCHE[t.tranche];
          if (t.nombre === 0) {
            return (
              <li key={t.tranche}>
                <button
                  type="button"
                  disabled={!onAjouter}
                  onClick={() => onAjouter?.(t.tranche)}
                  aria-label={`${label} : aucune visite${onAjouter ? ", ajouter une visite" : ""}`}
                  className="flex h-full min-h-[3.75rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line px-1 py-1.5 text-pine/35"
                >
                  <span className="text-[11px] font-medium">{label}</span>
                  {onAjouter && <Plus size={13} aria-hidden />}
                </button>
              </li>
            );
          }
          const etat = etatTranche(t.tranche, t.aFaire, heure);
          const c = COULEURS[etat];
          const charge = etatCharge(t.dureeMin, capaciteMin);
          return (
            <li key={t.tranche}>
              <button
                type="button"
                onClick={() => onVoir(t.tranche)}
                aria-label={`${label} : ${t.nombre} patient${t.nombre > 1 ? "s" : ""}, ${formaterDuree(t.dureeMin)}, ${t.faites} faite${t.faites > 1 ? "s" : ""}, ${t.aFaire} à faire, ${c.libelle.toLowerCase()}`}
                className={`flex h-full min-h-[3.75rem] w-full flex-col items-start gap-0.5 rounded-xl px-2 py-1.5 text-left ${c.fond}`}
              >
                <span className="flex w-full items-center gap-1 text-[11px] font-semibold text-pine">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${c.point}`} aria-hidden />
                  {label}
                </span>
                <span className="text-sm font-semibold leading-none text-ink">
                  {t.faites}/{t.nombre}
                  <span className="ml-1 text-[10px] font-medium text-pine/55">pat.</span>
                </span>
                <span className={`text-[10px] leading-tight ${charge === "depasse" ? "font-semibold text-statut-absent" : "text-pine/55"}`}>
                  {formaterDuree(t.dureeMin)}
                </span>
                <span className={`text-[10px] font-semibold leading-tight ${c.texte}`}>{c.libelle}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
