import "server-only";

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { detecterType, memeFamille, nettoyerMetadonnees, nomObjet, type TypeFichier } from "@/lib/fichiers";
import { ErreurMetier } from "@/lib/resultat";
import { patients } from "@/lib/schema";
import { buildObjectKeyFromName, isStorageConfigured, uploadObject } from "@/lib/storage";

// Vercel limite le corps d'une requête à 4,5 Mo : les photos sont réduites côté
// navigateur avant envoi (voir lib/image-client.ts), les PDF doivent rester sous 4 Mo.
export const TAILLE_MAX_FICHIER = 4 * 1024 * 1024;

export type FichierControle = { octets: Uint8Array; type: TypeFichier };

/**
 * Contrôles d'un fichier reçu : taille, format réel (signature), cohérence avec
 * le type annoncé, suppression des métadonnées des photos.
 */
export async function controlerFichier(file: File): Promise<FichierControle> {
  if (file.size === 0) throw new ErreurMetier("Aucun fichier reçu.");
  if (file.size > TAILLE_MAX_FICHIER) throw new ErreurMetier("Fichier trop volumineux (4 Mo maximum).");

  const brut = new Uint8Array(await file.arrayBuffer());
  const type = detecterType(brut);
  if (!type) {
    throw new ErreurMetier("Type de fichier non autorisé (photo JPEG, PNG, WebP ou PDF uniquement).");
  }
  if (!memeFamille(file.type, type)) {
    throw new ErreurMetier("Le contenu du fichier ne correspond pas à son type.");
  }

  try {
    return { octets: nettoyerMetadonnees(brut, type), type };
  } catch (e) {
    if (type.mime === "image/heic") {
      throw new ErreurMetier("Format HEIC non pris en charge : prenez la photo en JPEG ou réessayez depuis l'appli.");
    }
    void e;
    throw new ErreurMetier("Fichier illisible ou corrompu.");
  }
}

export async function verifierPatientExiste(soignanteId: string, patientId: string): Promise<void> {
  const rows = await withSoignante(soignanteId, (tx) =>
    tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).limit(1)
  );
  if (rows.length === 0) throw new ErreurMetier("Patient introuvable.");
}

/** Contrôle puis envoie un fichier ; renvoie la clé d'objet (nom généré côté serveur). */
export async function enregistrerFichier(
  soignanteId: string,
  patientId: string,
  dossier: "ordonnances" | "documents",
  file: File
): Promise<{ cle: string; type: TypeFichier }> {
  if (!isStorageConfigured()) throw new ErreurMetier("Le stockage de fichiers n'est pas encore configuré.");
  await verifierPatientExiste(soignanteId, patientId);
  const { octets, type } = await controlerFichier(file);
  const cle = buildObjectKeyFromName(nomObjet(patientId, dossier, type, randomUUID()));
  await uploadObject(cle, octets, type.mime);
  return { cle, type };
}
