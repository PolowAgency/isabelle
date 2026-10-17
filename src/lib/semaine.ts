import { ajouterJours, jourSemaineISO } from "@/lib/recurrence";

// Calculs de semaine sur des jours calendaires « YYYY-MM-DD » (pas d'heure
// locale : le « aujourd'hui » vient de todayISO(), à l'heure de Paris).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lundiDe(iso: string): string {
  return ajouterJours(iso, -(jourSemaineISO(iso) - 1));
}

export function joursDeLaSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

/** Lundi de la semaine demandée par `?semaine=`, ou de la semaine courante si absent / invalide. */
export function lundiDemande(param: string | undefined, aujourdhui: string): string {
  if (param && ISO_DATE.test(param)) {
    try {
      return lundiDe(param);
    } catch {
      // date impossible (2026-02-31) : on retombe sur la semaine courante
    }
  }
  return lundiDe(aujourdhui);
}

/**
 * Ordre d'affichage des jours : sur la semaine en cours, aujourd'hui d'abord
 * puis les jours à venir, et les jours déjà passés à la fin. Les autres
 * semaines restent dans l'ordre lundi -> dimanche.
 */
export function ordreJours(jours: string[], aujourdhui: string): string[] {
  if (!jours.includes(aujourdhui)) return jours;
  return [...jours.filter((j) => j >= aujourdhui), ...jours.filter((j) => j < aujourdhui)];
}
