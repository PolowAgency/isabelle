import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import {
  getDemoPatientDetail,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import {
  accesDomicile,
  documents,
  ordonnances,
  patients,
  secteurs,
  soignantes,
  traitements,
  transmissions,
  visites,
} from "@/lib/schema";
import { getSignedDownloadUrl, isStorageConfigured } from "@/lib/storage";

export type PatientSummary = {
  id: string;
  prenom: string;
  nom: string;
  age: number | null;
  telephone: string | null;
  adresse: string | null;
  complementAdresse: string | null;
  codePostal: string | null;
  ville: string | null;
  secteurNom: string;
  secteurCouleur: string;
  contactUrgenceNom: string | null;
  contactUrgenceTelephone: string | null;
  contactUrgenceLien: string | null;
  medecinTraitantNom: string | null;
  medecinTraitantTelephone: string | null;
};

export type PatientAccess = {
  patientId: string;
  codePortail: string | null;
  codeImmeuble: string | null;
  etage: string | null;
  digicodePorte: string | null;
  emplacementCle: string | null;
  presenceAnimal: boolean;
  descriptionAnimal: string | null;
  presenceAidant: boolean;
  detailsAidant: string | null;
  stationnement: string | null;
  notesAcces: string | null;
  updatedAt: string | null;
};

export type PatientTransmission = {
  id: string;
  contenu: string;
  importance: "info" | "attention" | "urgent";
  luePar: string[];
  isRead: boolean;
  createdAt: string;
  soignante: {
    id: string;
    prenom: string;
    nom: string;
    couleur: string;
  };
};

export type PatientTreatment = {
  id: string;
  libelle: string;
  dosage: string | null;
  passages: string[];
  notes: string | null;
};

export type PatientOrdonnance = {
  id: string;
  prescripteur: string | null;
  datePrescription: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  description: string | null;
  active: boolean;
  signedUrl: string | null;
  statut: "ok" | "soon" | "expired" | "unknown";
};

export type PatientVisitHistory = {
  id: string;
  date: string;
  passage: "matin" | "midi" | "soir";
  actes: string[];
  statut: "prevue" | "faite" | "absent" | "reportee" | "annulee";
  soignante: {
    id: string;
    prenom: string;
    nom: string;
    couleur: string;
  };
};

export type PatientDocument = {
  id: string;
  type: "photo" | "document";
  legende: string | null;
  createdAt: string;
  signedUrl: string | null;
  filename: string;
  isImage: boolean;
};

export type PatientDetailData = {
  patient: PatientSummary;
  access: PatientAccess;
  transmissions: PatientTransmission[];
  treatments: PatientTreatment[];
  ordonnances: PatientOrdonnance[];
  visits: PatientVisitHistory[];
  documents: PatientDocument[];
  storageConfigured: boolean;
};

function calculateAge(dateNaissance: string | null): number | null {
  if (!dateNaissance) return null;

  const today = new Date();
  const birth = new Date(`${dateNaissance}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasHadBirthday) age -= 1;
  return age;
}

function mapAccess(
  row: typeof accesDomicile.$inferSelect | undefined,
  patientId: string
): PatientAccess {
  return {
    patientId,
    codePortail: row?.codePortail ?? null,
    codeImmeuble: row?.codeImmeuble ?? null,
    etage: row?.etage ?? null,
    digicodePorte: row?.digicodePorte ?? null,
    emplacementCle: row?.emplacementCle ?? null,
    presenceAnimal: row?.presenceAnimal ?? false,
    descriptionAnimal: row?.descriptionAnimal ?? null,
    presenceAidant: row?.presenceAidant ?? false,
    detailsAidant: row?.detailsAidant ?? null,
    stationnement: row?.stationnement ?? null,
    notesAcces: row?.notesAcces ?? null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function ordonnanceStatut(dateFin: string | null): PatientOrdonnance["statut"] {
  if (!dateFin) return "unknown";

  const end = new Date(`${dateFin}T00:00:00`);
  const today = new Date();
  end.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

function filenameFromKey(key: string): string {
  return key.split("/").pop() ?? key;
}

export async function getPatientDetail(
  soignanteId: string,
  patientId: string
): Promise<PatientDetailData | null> {
  try {
    return await withSoignante(soignanteId, async (tx) => {
      const patientRows = await tx
        .select({
          id: patients.id,
          prenom: patients.prenom,
          nom: patients.nom,
          dateNaissance: patients.dateNaissance,
          telephone: patients.telephone,
          adresse: patients.adresse,
          complementAdresse: patients.complementAdresse,
          codePostal: patients.codePostal,
          ville: patients.ville,
          secteurNom: sql<string>`coalesce(${secteurs.nom}, 'Sans secteur')`,
          secteurCouleur: sql<string>`coalesce(${secteurs.couleur}, '#d8cfba')`,
          contactUrgenceNom: patients.contactUrgenceNom,
          contactUrgenceTelephone: patients.contactUrgenceTelephone,
          contactUrgenceLien: patients.contactUrgenceLien,
          medecinTraitantNom: patients.medecinTraitantNom,
          medecinTraitantTelephone: patients.medecinTraitantTelephone,
        })
        .from(patients)
        .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
        .where(eq(patients.id, patientId))
        .limit(1);

      const patientRow = patientRows[0];
      if (!patientRow) return null;

      const [
        accessRows,
        transmissionRows,
        treatmentRows,
        ordonnanceRows,
        visitRows,
        documentRows,
      ] = await Promise.all([
        tx.select().from(accesDomicile).where(eq(accesDomicile.patientId, patientId)).limit(1),
        tx
          .select({
            id: transmissions.id,
            contenu: transmissions.contenu,
            importance: transmissions.importance,
            luePar: transmissions.luePar,
            createdAt: transmissions.createdAt,
            soignanteId: soignantes.id,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
          })
          .from(transmissions)
          .innerJoin(soignantes, eq(soignantes.id, transmissions.soignanteId))
          .where(eq(transmissions.patientId, patientId))
          .orderBy(desc(transmissions.createdAt))
          .limit(50),
        tx
          .select({
            id: traitements.id,
            libelle: traitements.libelle,
            dosage: traitements.dosage,
            passages: traitements.passages,
            notes: traitements.notes,
          })
          .from(traitements)
          .where(and(eq(traitements.patientId, patientId), eq(traitements.actif, true)))
          .orderBy(asc(traitements.libelle)),
        tx
          .select({
            id: ordonnances.id,
            prescripteur: ordonnances.prescripteur,
            datePrescription: ordonnances.datePrescription,
            dateDebut: ordonnances.dateDebut,
            dateFin: ordonnances.dateFin,
            description: ordonnances.description,
            active: ordonnances.active,
            fichierKey: ordonnances.fichierKey,
          })
          .from(ordonnances)
          .where(and(eq(ordonnances.patientId, patientId), eq(ordonnances.active, true)))
          .orderBy(desc(ordonnances.active), asc(ordonnances.dateFin)),
        tx
          .select({
            id: visites.id,
            date: visites.date,
            passage: visites.passage,
            actes: visites.actes,
            statut: visites.statut,
            soignanteId: soignantes.id,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
          })
          .from(visites)
          .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
          .where(eq(visites.patientId, patientId))
          .orderBy(
            desc(visites.date),
            sql`case ${visites.passage}
              when 'soir' then 3
              when 'midi' then 2
              else 1
            end desc`
          )
          .limit(60),
        tx
          .select({
            id: documents.id,
            type: documents.type,
            fichierKey: documents.fichierKey,
            legende: documents.legende,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .where(eq(documents.patientId, patientId))
          .orderBy(desc(documents.createdAt))
          .limit(40),
      ]);

      const storageConfigured = isStorageConfigured();

      const [ordonnancesWithUrl, documentsWithUrl] = await Promise.all([
        Promise.all(
          ordonnanceRows.map(async (row) => ({
            id: row.id,
            prescripteur: row.prescripteur,
            datePrescription: row.datePrescription,
            dateDebut: row.dateDebut,
            dateFin: row.dateFin,
            description: row.description,
            active: row.active,
            signedUrl:
              storageConfigured && row.fichierKey
                ? await getSignedDownloadUrl(row.fichierKey).catch(() => null)
                : null,
            statut: ordonnanceStatut(row.dateFin),
          }))
        ),
        Promise.all(
          documentRows.map(async (row) => ({
            id: row.id,
            type: row.type,
            legende: row.legende,
            createdAt: row.createdAt.toISOString(),
            signedUrl: storageConfigured
              ? await getSignedDownloadUrl(row.fichierKey).catch(() => null)
              : null,
            filename: filenameFromKey(row.fichierKey),
            isImage: /\.(png|jpe?g|gif|webp|heic)$/i.test(row.fichierKey),
          }))
        ),
      ]);

      return {
        patient: {
          id: patientRow.id,
          prenom: patientRow.prenom,
          nom: patientRow.nom,
          age: calculateAge(patientRow.dateNaissance),
          telephone: patientRow.telephone,
          adresse: patientRow.adresse,
          complementAdresse: patientRow.complementAdresse,
          codePostal: patientRow.codePostal,
          ville: patientRow.ville,
          secteurNom: patientRow.secteurNom,
          secteurCouleur: patientRow.secteurCouleur,
          contactUrgenceNom: patientRow.contactUrgenceNom,
          contactUrgenceTelephone: patientRow.contactUrgenceTelephone,
          contactUrgenceLien: patientRow.contactUrgenceLien,
          medecinTraitantNom: patientRow.medecinTraitantNom,
          medecinTraitantTelephone: patientRow.medecinTraitantTelephone,
        },
        access: mapAccess(accessRows[0], patientId),
        transmissions: transmissionRows.map((row) => ({
          id: row.id,
          contenu: row.contenu,
          importance: row.importance,
          luePar: row.luePar,
          isRead: row.luePar.includes(soignanteId),
          createdAt: row.createdAt.toISOString(),
          soignante: {
            id: row.soignanteId,
            prenom: row.soignantePrenom,
            nom: row.soignanteNom,
            couleur: row.soignanteCouleur,
          },
        })),
        treatments: treatmentRows,
        ordonnances: ordonnancesWithUrl,
        visits: visitRows.map((row) => ({
          id: row.id,
          date: row.date,
          passage: row.passage,
          actes: row.actes,
          statut: row.statut,
          soignante: {
            id: row.soignanteId,
            prenom: row.soignantePrenom,
            nom: row.soignanteNom,
            couleur: row.soignanteCouleur,
          },
        })),
        documents: documentsWithUrl,
        storageConfigured,
      };
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoPatientDetail(soignanteId, patientId) as PatientDetailData | null;
    }
    throw error;
  }
}
