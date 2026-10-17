import { chiffrer, contexteAcces, dechiffrer, CHAMPS_ACCES_CHIFFRES, type ChampAccesChiffre } from "@/lib/crypto";
import type { PatientAccess } from "@/lib/patient-detail";
import type { accesDomicile } from "@/lib/schema";

type LigneAcces = typeof accesDomicile.$inferSelect;

/** Chiffre les champs sensibles d'un patch avant écriture (les autres champs passent tels quels). */
export function chiffrerPatchAcces<T extends Partial<Record<ChampAccesChiffre, string | null | undefined>>>(
  patientId: string,
  patch: T
): T {
  const sortie: Record<string, unknown> = { ...patch };
  for (const champ of CHAMPS_ACCES_CHIFFRES) {
    if (patch[champ] !== undefined) sortie[champ] = chiffrer(patch[champ], contexteAcces(patientId, champ));
  }
  return sortie as T;
}

/** Ligne de acces_domicile -> objet affichable, champs sensibles déchiffrés. */
export function lireAcces(row: LigneAcces | undefined, patientId: string): PatientAccess {
  const illisibles: string[] = [];
  // Un champ impossible à déchiffrer (clé absente, valeur altérée) ne doit pas faire
  // tomber toute la fiche : il est signalé à l'écran, les autres informations restent lisibles.
  const lire = (champ: ChampAccesChiffre) => {
    try {
      return dechiffrer(row?.[champ] ?? null, contexteAcces(patientId, champ));
    } catch {
      illisibles.push(champ);
      return null;
    }
  };
  const acces: PatientAccess = {
    patientId,
    codePortail: lire("codePortail"),
    codeImmeuble: lire("codeImmeuble"),
    etage: row?.etage ?? null,
    digicodePorte: lire("digicodePorte"),
    emplacementCle: lire("emplacementCle"),
    presenceAnimal: row?.presenceAnimal ?? false,
    descriptionAnimal: row?.descriptionAnimal ?? null,
    presenceAidant: row?.presenceAidant ?? false,
    detailsAidant: row?.detailsAidant ?? null,
    stationnement: row?.stationnement ?? null,
    notesAcces: lire("notesAcces"),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
  if (illisibles.length > 0) {
    acces.illisibles = illisibles;
    // Message générique : ni patient, ni valeur, ni champ dans les logs.
    console.error("Des informations d'accès chiffrées sont illisibles (clé DATA_ENCRYPTION_KEY ?).");
  }
  return acces;
}
