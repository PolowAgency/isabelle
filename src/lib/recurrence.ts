import type { FrequenceSerie } from "@/lib/schema";

// Génération des dates d'une série de visites (soin chronique).
//
// Fonctions pures, sans accès base ni horloge. Les dates sont des jours
// calendaires « YYYY-MM-DD » (le type SQL `date`) : tout le calcul passe par
// Date.UTC, jamais par l'heure locale. Le changement d'heure d'Europe/Paris
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

const MS_PAR_JOUR = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function jourVersNumero(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Date invalide : ${iso}`);
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  // Date.UTC accepte 2026-02-31 et le recale en mars : on refuse.
  if (numeroVersJour(ms / MS_PAR_JOUR) !== iso) throw new RangeError(`Date invalide : ${iso}`);
  return ms / MS_PAR_JOUR;
}

function numeroVersJour(numero: number): string {
  return new Date(numero * MS_PAR_JOUR).toISOString().slice(0, 10);
}

export function ajouterJours(iso: string, jours: number): string {
  return numeroVersJour(jourVersNumero(iso) + jours);
}

/** 1 = lundi … 7 = dimanche. */
export function jourSemaineISO(iso: string): number {
  const dow = new Date(jourVersNumero(iso) * MS_PAR_JOUR).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Ajoute des mois en ramenant au dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function ajouterMois(iso: string, mois: number): string {
  jourVersNumero(iso);
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + mois;
  const annee = Math.floor(total / 12);
  const moisIndex = total - annee * 12;
  const dernierJour = new Date(Date.UTC(annee, moisIndex + 1, 0)).getUTCDate();
  return numeroVersJour(Date.UTC(annee, moisIndex, Math.min(d, dernierJour)) / MS_PAR_JOUR);
}

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
