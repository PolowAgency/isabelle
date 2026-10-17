import { dureeDeLaVisite, etatCharge, type EtatCharge } from "@/lib/planning-calc";
import { TRANCHES, type Tranche } from "@/lib/tranches";

// Agenda de la semaine : grille jours × tranches. Fonctions pures, sans horloge : les jours sont des
// « AAAA-MM-JJ » (jamais d'heure locale), donc le changement d'heure d'Europe/Paris ne peut ni
// décaler ni dupliquer une case.

export type VisiteAgenda = {
  date: string;
  tranche: string;
  statut: string;
  soignanteId: string;
  actes: readonly string[];
  dureeEstimeeMin: number | null;
};

export type CelluleGrille = {
  jour: string;
  tranche: Tranche;
  /** Patients attendus (visites non annulées ni reportées). */
  nombre: number;
  /** Temps prévu total, et charge de la soignante la plus chargée sur cette case. */
  dureeMin: number;
  chargeMaxMin: number;
  /** Rapportée à la capacité d'une tranche pour une soignante. */
  etat: EtatCharge;
};

/**
 * Grille de la semaine : `grille[t][j]` = la case de la tranche t (dans l'ordre de la journée) pour le
 * jour j (dans l'ordre de `jours`). `soignanteId` restreint à une soignante ; sinon toute l'équipe, la
 * charge étant celle de la soignante la plus chargée (la capacité est « par infirmière »).
 */
export function grilleSemaine(
  visites: readonly VisiteAgenda[],
  jours: readonly string[],
  durees: Record<string, number>,
  capaciteMin: number,
  soignanteId?: string
): CelluleGrille[][] {
  const index = new Map(jours.map((j, i) => [j, i]));
  const cases = TRANCHES.map((tranche) =>
    jours.map((jour) => ({ jour, tranche, nombre: 0, dureeMin: 0, parSoignante: new Map<string, number>() }))
  );
  for (const v of visites) {
    if (v.statut === "annulee" || v.statut === "reportee") continue;
    if (soignanteId && v.soignanteId !== soignanteId) continue;
    const j = index.get(v.date);
    const t = TRANCHES.indexOf(v.tranche as Tranche);
    if (j === undefined || t < 0) continue;
    const duree = dureeDeLaVisite(v, durees);
    const c = cases[t][j];
    c.nombre += 1;
    c.dureeMin += duree;
    c.parSoignante.set(v.soignanteId, (c.parSoignante.get(v.soignanteId) ?? 0) + duree);
  }
  return cases.map((ligne) =>
    ligne.map((c) => {
      let chargeMaxMin = 0;
      c.parSoignante.forEach((minutes) => {
        chargeMaxMin = Math.max(chargeMaxMin, minutes);
      });
      return {
        jour: c.jour,
        tranche: c.tranche,
        nombre: c.nombre,
        dureeMin: c.dureeMin,
        chargeMaxMin,
        etat: etatCharge(chargeMaxMin, capaciteMin),
      };
    })
  );
}

/** Absences qui couvrent un jour donné (bornes incluses). */
export function absencesDuJour<T extends { dateDebut: string; dateFin: string }>(absences: readonly T[], jour: string): T[] {
  return absences.filter((a) => a.dateDebut <= jour && a.dateFin >= jour);
}
