import { dureeDeLaVisite } from "@/lib/planning-calc";

// Répartition des visites d'une soignante absente entre ses collègues : fonctions pures
// (aucune base, aucune horloge), utilisées par l'écran de répartition et testées seules.

export type VisiteCharge = {
  date: string;
  tranche: string;
  actes: readonly string[];
  dureeEstimeeMin: number | null;
};

export type Collegue = {
  id: string;
  /** Visites déjà prévues (non annulées) de cette collègue sur la période de l'absence. */
  visites: readonly VisiteCharge[];
  /** Jours de la période où elle est elle-même absente. */
  joursAbsente: ReadonlySet<string>;
};

export type GroupePatient = {
  patientId: string;
  visites: readonly VisiteCharge[];
};

type Durees = Record<string, number>;

const minutes = (visites: readonly VisiteCharge[], durees: Durees) =>
  visites.reduce((somme, v) => somme + dureeDeLaVisite(v, durees), 0);

/** Combien de cases (jour × tranche) dépassent la capacité. */
export function casesEnDepassement(visites: readonly VisiteCharge[], durees: Durees, capaciteMin: number): number {
  const parCase = new Map<string, number>();
  for (const v of visites) {
    const cle = `${v.date}|${v.tranche}`;
    parCase.set(cle, (parCase.get(cle) ?? 0) + dureeDeLaVisite(v, durees));
  }
  let n = 0;
  parCase.forEach((total) => {
    if (total > capaciteMin) n += 1;
  });
  return n;
}

export type ApercuCollegue = {
  collegueId: string;
  /** Visites et temps prévus sur la période, avant et après la répartition. */
  nbAvant: number;
  nbApres: number;
  minAvant: number;
  minApres: number;
  /** Cases jour × tranche au-dessus de la capacité, avant et après. */
  depassementsAvant: number;
  depassementsApres: number;
  /** Visites confiées un jour où cette collègue est elle-même absente. */
  surJoursAbsente: number;
};

/**
 * Aperçu de la charge de chaque collègue si on appliquait `affectation` (patientId -> collègue).
 * Les patients sans collègue choisie ne sont comptés chez personne.
 */
export function apercuRepartition(
  groupes: readonly GroupePatient[],
  collegues: readonly Collegue[],
  affectation: Readonly<Record<string, string | null | undefined>>,
  durees: Durees,
  capaciteMin: number
): ApercuCollegue[] {
  return collegues.map((c) => {
    const confiees = groupes.filter((g) => affectation[g.patientId] === c.id).flatMap((g) => [...g.visites]);
    const apres = [...c.visites, ...confiees];
    return {
      collegueId: c.id,
      nbAvant: c.visites.length,
      nbApres: apres.length,
      minAvant: minutes(c.visites, durees),
      minApres: minutes(apres, durees),
      depassementsAvant: casesEnDepassement(c.visites, durees, capaciteMin),
      depassementsApres: casesEnDepassement(apres, durees, capaciteMin),
      surJoursAbsente: confiees.filter((v) => c.joursAbsente.has(v.date)).length,
    };
  });
}

/**
 * Proposition équitable : on place les patients du plus lourd au plus léger chez la collègue
 * qui a le moins de temps prévu (en tenant compte de ce qu'on vient de lui confier). Une collègue
 * absente un des jours concernés n'est choisie que s'il n'y a personne d'autre.
 */
export function proposerRepartition(
  groupes: readonly GroupePatient[],
  collegues: readonly Collegue[],
  durees: Durees
): Record<string, string> {
  const resultat: Record<string, string> = {};
  if (collegues.length === 0) return resultat;
  const charge = new Map(collegues.map((c) => [c.id, minutes(c.visites, durees)]));

  const lourds = [...groupes].sort(
    (a, b) => minutes(b.visites, durees) - minutes(a.visites, durees) || a.patientId.localeCompare(b.patientId)
  );
  for (const g of lourds) {
    const jours = g.visites.map((v) => v.date);
    const disponibles = collegues.filter((c) => !jours.some((j) => c.joursAbsente.has(j)));
    const candidates = disponibles.length > 0 ? disponibles : collegues;
    const choisie = [...candidates].sort(
      (a, b) => charge.get(a.id)! - charge.get(b.id)! || a.id.localeCompare(b.id)
    )[0];
    resultat[g.patientId] = choisie.id;
    charge.set(choisie.id, charge.get(choisie.id)! + minutes(g.visites, durees));
  }
  return resultat;
}
