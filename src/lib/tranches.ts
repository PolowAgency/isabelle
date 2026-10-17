// Tranches horaires de passage. Le passage (matin / midi / soir) est dérivé de
// la tranche — côté base, `visites.passage` est une colonne générée avec la
// même règle (migrations/0005_tranches_horaires.sql) : matin avant 12 h,
// midi de 12 h à 16 h, soir à partir de 16 h.

export const TRANCHES = ["6-8", "8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-21"] as const;
export type Tranche = (typeof TRANCHES)[number];
export type Passage = "matin" | "midi" | "soir";

export const PASSAGES: Passage[] = ["matin", "midi", "soir"];

export const PASSAGE_LABELS: Record<Passage, string> = {
  matin: "Matin",
  midi: "Midi",
  soir: "Soir",
};

type InfosTranche = { debut: number; fin: number; label: string };

export const INFOS_TRANCHE: Record<Tranche, InfosTranche> = {
  "6-8": { debut: 6, fin: 8, label: "6h–8h" },
  "8-10": { debut: 8, fin: 10, label: "8h–10h" },
  "10-12": { debut: 10, fin: 12, label: "10h–12h" },
  "12-14": { debut: 12, fin: 14, label: "12h–14h" },
  "14-16": { debut: 14, fin: 16, label: "14h–16h" },
  "16-18": { debut: 16, fin: 18, label: "16h–18h" },
  "18-20": { debut: 18, fin: 20, label: "18h–20h" },
  "20-21": { debut: 20, fin: 21, label: "20h–21h" },
};

export function estTranche(value: unknown): value is Tranche {
  return typeof value === "string" && (TRANCHES as readonly string[]).includes(value);
}

export function libelleTranche(tranche: Tranche): string {
  return INFOS_TRANCHE[tranche].label;
}

export function passageDeTranche(tranche: Tranche): Passage {
  const { debut } = INFOS_TRANCHE[tranche];
  if (debut < 12) return "matin";
  if (debut < 16) return "midi";
  return "soir";
}

/** Tranche attribuée aux visites existantes (migration) et au choix « Matin / Midi / Soir » sans précision. */
export function trancheParDefaut(passage: Passage): Tranche {
  return passage === "matin" ? "8-10" : passage === "midi" ? "12-14" : "18-20";
}

export function tranchesDuPassage(passage: Passage): Tranche[] {
  return TRANCHES.filter((t) => passageDeTranche(t) === passage);
}

/** Tranche en cours pour une heure donnée (0-23) ; avant 6 h → 6-8, après 21 h → 20-21. */
export function trancheDeHeure(heure: number): Tranche {
  for (const t of TRANCHES) {
    if (heure >= INFOS_TRANCHE[t].debut && heure < INFOS_TRANCHE[t].fin) return t;
  }
  return heure < 6 ? "6-8" : "20-21";
}

export type EtatTranche = "terminee" | "en_cours" | "en_retard" | "a_venir";

/**
 * État visuel d'une tranche de la journée :
 * - terminée : plus rien à faire dedans ;
 * - en cours : l'heure actuelle est dans la tranche ;
 * - en retard : la tranche est passée mais il reste des visites prévues ;
 * - à venir : pas encore commencée.
 * `heureActuelle` est l'heure décimale (ex. 9.5 pour 9 h 30) à Paris, ou `null`
 * pour un autre jour que le jour courant (tout est alors « à venir »).
 */
export function etatTranche(
  tranche: Tranche,
  restantes: number,
  heureActuelle: number | null
): EtatTranche {
  if (restantes === 0) return "terminee";
  if (heureActuelle === null) return "a_venir";
  const { debut, fin } = INFOS_TRANCHE[tranche];
  if (heureActuelle >= fin) return "en_retard";
  if (heureActuelle >= debut) return "en_cours";
  return "a_venir";
}
