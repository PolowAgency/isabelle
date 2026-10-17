// Prises de traitement : types et règles partagés (serveur, écran, hors-ligne). Aucune dépendance serveur.

export const STATUTS_PRISE = ["administre", "refuse", "non_administre"] as const;
export type StatutPriseCalc = (typeof STATUTS_PRISE)[number];

export const LIBELLES_PRISE: Record<StatutPriseCalc, string> = {
  administre: "Administré",
  refuse: "Refusé",
  non_administre: "Non administré",
};

export const COMMENTAIRE_PRISE_MAX = 300;

export type TraitementDu = { id: string; libelle: string; dosage: string | null };
export type PriseSaisie = { traitementId: string; statut: StatutPriseCalc; commentaire: string | null };

/** Une prise refusée ou non administrée alerte l'équipe. */
export function priseALerte(statut: StatutPriseCalc): boolean {
  return statut !== "administre";
}

/** Traitements prévus à ce passage pour lesquels aucune prise n'est encore renseignée. */
export function traitementsSansReponse(
  dus: readonly { id: string }[],
  saisies: readonly { traitementId: string }[],
  existantes: readonly { traitementId: string }[] = []
): string[] {
  const repondus = new Set([...saisies, ...existantes].map((p) => p.traitementId));
  return dus.filter((t) => !repondus.has(t.id)).map((t) => t.id);
}

/**
 * Prises à enregistrer à partir de ce que l'infirmière a saisi : on ne garde que les traitements
 * réellement prévus à ce passage, une seule prise par traitement (la dernière saisie), commentaire borné.
 */
export function normaliserPrises(
  dus: readonly { id: string }[],
  saisies: readonly PriseSaisie[]
): PriseSaisie[] {
  const permis = new Set(dus.map((t) => t.id));
  const parTraitement = new Map<string, PriseSaisie>();
  for (const s of saisies) {
    if (!permis.has(s.traitementId)) continue;
    const commentaire = s.statut === "administre" ? null : (s.commentaire?.trim().slice(0, COMMENTAIRE_PRISE_MAX) || null);
    parTraitement.set(s.traitementId, { traitementId: s.traitementId, statut: s.statut, commentaire });
  }
  return Array.from(parTraitement.values());
}
