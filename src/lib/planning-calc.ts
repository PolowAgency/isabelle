import { ACTES } from "@/lib/actes";
import { TRANCHES, type Tranche } from "@/lib/tranches";

// Durées et charge de travail : fonctions pures (aucune base, aucune horloge),
// partagées par le serveur, l'écran et le mode hors-ligne.

/** Durée par défaut d'un acte, en minutes (modifiable par un administrateur, voir actes_durees). */
export const DUREES_PAR_DEFAUT: Record<string, number> = {
  pansement: 15,
  injection: 10,
  "prise de sang": 15,
  toilette: 30,
  perfusion: 45,
  surveillance: 10,
  autre: 15,
};
/** Durée minimale d'une visite, en minutes (règle de l'équipe). */
export const DUREE_MIN_VISITE = 5;

/** Durée d'un acte absent de la liste (saisie libre ancienne). */
export const DUREE_ACTE_INCONNU = 15;

/** Capacité par défaut d'une tranche : 2 h. */
export const CAPACITE_TRANCHE_DEFAUT_MIN = 120;

export type ReglagesPlanning = {
  /** Durée (min) de chaque acte de la liste, valeurs par défaut + réglages de l'admin déjà fusionnés. */
  durees: Record<string, number>;
  capaciteTrancheMin: number;
};

export function reglagesParDefaut(): ReglagesPlanning {
  return { durees: { ...DUREES_PAR_DEFAUT }, capaciteTrancheMin: CAPACITE_TRANCHE_DEFAUT_MIN };
}

/** Fusionne les réglages enregistrés (admin) par-dessus les valeurs par défaut. */
export function fusionnerReglages(
  durees: { acte: string; dureeMin: number }[],
  capaciteTrancheMin: number | null
): ReglagesPlanning {
  const base = reglagesParDefaut();
  for (const d of durees) base.durees[d.acte] = d.dureeMin;
  return { durees: base.durees, capaciteTrancheMin: capaciteTrancheMin ?? CAPACITE_TRANCHE_DEFAUT_MIN };
}

/** Somme des durées des actes (au moins DUREE_MIN_VISITE) ; null s'il n'y a aucun acte. */
export function dureeDeActes(actes: readonly string[], durees: Record<string, number>): number | null {
  if (actes.length === 0) return null;
  return Math.max(DUREE_MIN_VISITE, actes.reduce((somme, acte) => somme + (durees[acte] ?? DUREE_ACTE_INCONNU), 0));
}

type VisiteDuree = { actes: readonly string[]; dureeEstimeeMin: number | null };

/** Durée retenue pour une visite : celle enregistrée (calculée ou saisie à la main), sinon la somme de ses actes. */
export function dureeDeLaVisite(visite: VisiteDuree, durees: Record<string, number>): number {
  return visite.dureeEstimeeMin ?? dureeDeActes(visite.actes, durees) ?? 0;
}

export type EtatCharge = "vide" | "ok" | "proche" | "depasse";

/** « proche » à partir de 80 % de la capacité, « depasse » au-delà de 100 %. */
export function etatCharge(minutes: number, capaciteMin: number): EtatCharge {
  if (minutes <= 0) return "vide";
  if (minutes > capaciteMin) return "depasse";
  return minutes >= capaciteMin * 0.8 ? "proche" : "ok";
}

/** « 45 min », « 2 h », « 2 h 15 ». */
export function formaterDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Actes proposés dans l'interface avec leur durée courante (écran de réglages). */
export function actesAvecDuree(durees: Record<string, number>): { value: string; label: string; dureeMin: number }[] {
  return ACTES.map((a) => ({ ...a, dureeMin: durees[a.value] ?? DUREE_ACTE_INCONNU }));
}

// --- Agrégats par tranche (Lots G et J) -----------------------------------------

type VisiteAgregee = VisiteDuree & { tranche: string; statut: string };

export type AgregatTranche = {
  tranche: Tranche;
  /** Nombre de visites comptées (hors annulées). */
  nombre: number;
  /** Visites encore à faire / déjà faites (les absentes et reportées ne sont plus à faire). */
  aFaire: number;
  faites: number;
  /** Durée prévue de toutes les visites comptées, et de celles encore à faire. */
  dureeMin: number;
  dureeRestanteMin: number;
};

/**
 * Agrégats des 8 tranches. Une visite annulée n'est jamais comptée ; une visite reportée
 * non plus (elle a été recréée le lendemain) ; une absente reste comptée comme passage
 * prévu mais n'est plus « à faire ».
 */
export function agregerParTranche(visites: readonly VisiteAgregee[], durees: Record<string, number>): AgregatTranche[] {
  const parTranche = new Map<string, AgregatTranche>(
    TRANCHES.map((t) => [t, { tranche: t, nombre: 0, aFaire: 0, faites: 0, dureeMin: 0, dureeRestanteMin: 0 }])
  );
  for (const v of visites) {
    if (v.statut === "annulee" || v.statut === "reportee") continue;
    const a = parTranche.get(v.tranche);
    if (!a) continue;
    const duree = dureeDeLaVisite(v, durees);
    a.nombre += 1;
    a.dureeMin += duree;
    if (v.statut === "prevue") {
      a.aFaire += 1;
      a.dureeRestanteMin += duree;
    } else if (v.statut === "faite") {
      a.faites += 1;
    }
  }
  return TRANCHES.map((t) => parTranche.get(t)!);
}
