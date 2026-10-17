import { trancheDeHeure, type Tranche } from "@/lib/tranches";

// Toute la logique de date de l'application passe par ce fichier.
//
// - « Aujourd'hui », l'heure et le passage courant sont calculés à Paris
//   (Europe/Paris), quel que soit le fuseau du serveur (UTC sur Vercel) ou du
//   navigateur.
// - Les jours calendaires « AAAA-MM-JJ » (type SQL `date`) sont manipulés en
//   arithmétique UTC pure : ni changement d'heure ni fuseau ne peuvent sauter
//   ou dupliquer un jour.

const TZ = "Europe/Paris";

export function parisParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Jour courant à Paris. */
export function todayISO(now: Date = new Date()): string {
  return parisParts(now).iso;
}

/** Heure décimale à Paris (9 h 30 -> 9.5), utilisable côté client comme côté serveur. */
export function heureParis(now: Date = new Date()): number {
  const { hour, minute } = parisParts(now);
  return hour + minute / 60;
}

export function inferTranche(now: Date = new Date()): Tranche {
  return trancheDeHeure(Math.floor(heureParis(now)));
}

export function inferPassage(now: Date = new Date()): "matin" | "midi" | "soir" {
  const { hour } = parisParts(now);
  if (hour < 11) return "matin";
  if (hour < 16) return "midi";
  return "soir";
}

export function greeting(now: Date = new Date()): string {
  const { hour } = parisParts(now);
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Instant -> jour calendaire à Paris (ex. un horodatage `timestamptz`). */
export function dateParisDe(instant: Date): string {
  return parisParts(instant).iso;
}

// ---------------------------------------------------------------------------
// Jours calendaires (arithmétique UTC)
// ---------------------------------------------------------------------------

const MS_PAR_JOUR = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function jourVersNumero(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Date invalide : ${iso}`);
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  // Date.UTC accepte 2026-02-31 et le recale en mars : on refuse.
  if (numeroVersJour(ms / MS_PAR_JOUR) !== iso) throw new RangeError(`Date invalide : ${iso}`);
  return ms / MS_PAR_JOUR;
}

export function numeroVersJour(numero: number): string {
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


/** Vrai pour une date ISO réelle (refuse 2026-02-31, « abc », 2026-2-1). */
export function estDateISOValide(valeur: unknown): valeur is string {
  if (typeof valeur !== "string") return false;
  try {
    jourVersNumero(valeur);
    return true;
  } catch {
    return false;
  }
}

/** Lundi de la semaine ISO contenant ce jour. */
export function lundiDe(iso: string): string {
  return ajouterJours(iso, -(jourSemaineISO(iso) - 1));
}

export function joursDeLaSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function composantes(iso: string) {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return { annee, mois, jour, dow: new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() };
}

export function formatDateLong(iso: string): string {
  const { mois, jour, dow } = composantes(iso);
  return `${JOURS[dow]} ${jour} ${MOIS[mois - 1]}`;
}

/** « lundi 19 octobre 2026 » : identique côté serveur et navigateur, quel que soit le fuseau. */
export function formatDateComplete(iso: string): string {
  const { annee, mois, jour, dow } = composantes(iso);
  return `${JOURS[dow]} ${jour} ${MOIS[mois - 1]} ${annee}`;
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDateShort(iso: string): string {
  const { mois, jour } = composantes(iso);
  return `${String(jour).padStart(2, "0")}/${String(mois).padStart(2, "0")}`;
}
