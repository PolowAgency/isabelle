import {
  ajouterJours,
  ajouterMois,
  jourSemaineISO,
  jourVersNumero,
  numeroVersJour,
} from "@/lib/date";
import type { FrequenceSerie } from "@/lib/schema";

// Primitives de date centralisées dans date.ts, ré-exportées pour compatibilité.
export { ajouterJours, ajouterMois, jourSemaineISO };

// Génération des dates d'une série de visites (soin chronique).
//
// Fonctions pures, sans accès base ni horloge. Les dates sont des jours
// calendaires « YYYY-MM-DD » (le type SQL `date`) : tout le calcul passe par
// Date.UTC (voir date.ts), jamais par l'heure locale. Le changement d'heure d'Europe/Paris
// (dernier dimanche de mars / d'octobre) ne peut donc ni sauter ni dupliquer
// un jour, quel que soit le fuseau du serveur.

export type UniteDuree = "jours" | "semaines" | "mois";

export type DefinitionSerie = {
  dateDebut: string;
  dateFin: string;
  frequence: FrequenceSerie;
  /** Jours ISO (1 = lundi … 7 = dimanche). */
  joursSemaine?: number[];
};

/** Garde-fou : une série ne couvre jamais plus d'un an. */
export const MAX_JOURS_SERIE = 366;

/**
 * Date de fin (incluse) d'une série à partir d'une durée.
 * 30 jours à partir du 1er sept. -> 30 sept. ; 1 mois à partir du 1er sept. -> 30 sept. ;
 * 1 mois à partir du 15 janv. -> 14 févr.
 */
export function dateFinDepuisDuree(dateDebut: string, unite: UniteDuree, nombre: number): string {
  if (!Number.isInteger(nombre) || nombre < 1) {
    throw new RangeError("La durée doit être un entier positif.");
  }
  if (unite === "jours") return ajouterJours(dateDebut, nombre - 1);
  if (unite === "semaines") return ajouterJours(dateDebut, nombre * 7 - 1);
  return ajouterJours(ajouterMois(dateDebut, nombre), -1);
}

/** Jours ISO normalisés (entiers 1..7, sans doublon, triés). */
export function normaliserJoursSemaine(jours: number[] | undefined): number[] {
  const uniques = new Set<number>();
  for (const jour of jours ?? []) {
    if (!Number.isInteger(jour) || jour < 1 || jour > 7) {
      throw new RangeError(`Jour de la semaine invalide : ${jour}`);
    }
    uniques.add(jour);
  }
  return Array.from(uniques).sort((a, b) => a - b);
}

/**
 * Dates (triées, sans doublon) d'une série, bornes incluses.
 * - quotidien : tous les jours
 * - un_jour_sur_deux : date_debut, +2 j, +4 j…
 * - jours_semaine : les jours choisis, chaque semaine
 * - une_semaine_sur_deux : une semaine ISO sur deux, en partant de la semaine
 *   de date_debut ; jours choisis, ou à défaut le jour de date_debut
 */
export function genererDatesSerie(serie: DefinitionSerie): string[] {
  const debut = jourVersNumero(serie.dateDebut);
  const fin = jourVersNumero(serie.dateFin);
  if (fin < debut) throw new RangeError("La date de fin précède la date de début.");
  if (fin - debut + 1 > MAX_JOURS_SERIE) {
    throw new RangeError(`Une série ne peut pas dépasser ${MAX_JOURS_SERIE} jours.`);
  }

  const jours = normaliserJoursSemaine(serie.joursSemaine);
  if (serie.frequence === "jours_semaine" && jours.length === 0) {
    throw new RangeError("Choisissez au moins un jour de la semaine.");
  }
  const joursRetenus =
    serie.frequence === "une_semaine_sur_deux" && jours.length === 0
      ? [jourSemaineISO(serie.dateDebut)]
      : jours;

  const lundiDeDebut = debut - (jourSemaineISO(serie.dateDebut) - 1);
  const dates: string[] = [];

  for (let numero = debut; numero <= fin; numero++) {
    const jour = numeroVersJour(numero);
    let retenu: boolean;
    switch (serie.frequence) {
      case "quotidien":
        retenu = true;
        break;
      case "un_jour_sur_deux":
        retenu = (numero - debut) % 2 === 0;
        break;
      case "jours_semaine":
        retenu = joursRetenus.includes(jourSemaineISO(jour));
        break;
      case "une_semaine_sur_deux":
        retenu =
          Math.floor((numero - lundiDeDebut) / 7) % 2 === 0 &&
          joursRetenus.includes(jourSemaineISO(jour));
        break;
    }
    if (retenu) dates.push(jour);
  }

  return dates;
}

export const FREQUENCE_LABELS: Record<FrequenceSerie, string> = {
  quotidien: "Tous les jours",
  un_jour_sur_deux: "Un jour sur deux",
  une_semaine_sur_deux: "Une semaine sur deux",
  jours_semaine: "Certains jours de la semaine",
};

export const JOURS_SEMAINE_COURTS = ["L", "M", "M", "J", "V", "S", "D"] as const;
export const JOURS_SEMAINE_LABELS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;
