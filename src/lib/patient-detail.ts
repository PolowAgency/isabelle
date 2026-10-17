import "server-only";

import { and, asc, desc, eq, gte, lt, ne, or, sql } from "drizzle-orm";
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
  seriesVisites,
  soignantes,
  traitements,
  transmissions,
  visites,
} from "@/lib/schema";
import { getSignedDownloadUrl, isStorageConfigured } from "@/lib/storage";
import { lireHistoriquePrisesDansTx, type PriseHistorique } from "@/lib/prises";
import { lireAcces } from "@/lib/acces";
import { auditer } from "@/lib/audit";
import { jourVersNumero, todayISO } from "@/lib/date";
import { ordreTranche } from "@/lib/tournee";
import type { FrequenceSerie } from "@/lib/schema";
import type { Tranche } from "@/lib/tranches";

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
  /** Champs chiffrés impossibles à déchiffrer (clé absente ou erronée) : à signaler, jamais à masquer. */
  illisibles?: string[];
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
  tranche: Tranche;
  actes: string[];
  statut: "prevue" | "faite" | "absent" | "reportee" | "annulee";
  soignante: {
    id: string;
    prenom: string;
    nom: string;
    couleur: string;
  };
};

export type PatientProchaineVisite = {
  id: string;
  date: string;
  tranche: Tranche;
  actes: string[];
  serieId: string | null;
  soignante: { id: string; prenom: string; nom: string; couleur: string };
};

/** Série (soin récurrent) qui a encore des visites à venir. */
export type PatientSerie = {
  id: string;
  dateDebut: string;
  dateFin: string;
  frequence: FrequenceSerie;
  joursSemaine: number[];
  tranches: Tranche[];
  actes: string[];
  restantes: number;
  prochaineDate: string | null;
  soignante: { id: string; prenom: string; nom: string; couleur: string };
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
  /** Visites passées ou déjà traitées, les plus récentes d'abord. */
  visits: PatientVisitHistory[];
  /** Visites encore prévues à partir d'aujourd'hui, les plus proches d'abord. */
  prochaines: PatientProchaineVisite[];
  series: PatientSerie[];
  documents: PatientDocument[];
  /** Historique des prises de traitement (les plus récentes d'abord). */
  prises: PriseHistorique[];
  storageConfigured: boolean;
};

function calculateAge(dateNaissance: string | null): number | null {
  if (!dateNaissance) return null;
  const [ny, nm, nd] = dateNaissance.split("-").map(Number);
  const [ty, tm, td] = todayISO().split("-").map(Number);
  let age = ty - ny;
  if (tm < nm || (tm === nm && td < nd)) age -= 1;
  return age;
}

function ordonnanceStatut(dateFin: string | null): PatientOrdonnance["statut"] {
  if (!dateFin) return "unknown";
  const diffDays = jourVersNumero(dateFin) - jourVersNumero(todayISO());
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
  const aujourdhui = todayISO();
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
        prochainesRows,
        serieRows,
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
        // Historique : tout ce qui n'est plus « à venir ». Les visites futures
        // (parfois des dizaines pour une série) ont leur propre requête, sinon
        // elles évinceraient l'historique et les prochaines visites seraient tronquées.
        tx
          .select({
            id: visites.id,
            date: visites.date,
            passage: visites.passage,
            tranche: visites.tranche,
            actes: visites.actes,
            statut: visites.statut,
            soignanteId: soignantes.id,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
          })
          .from(visites)
          .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
          .where(
            and(
              eq(visites.patientId, patientId),
              or(lt(visites.date, aujourdhui), ne(visites.statut, "prevue"))
            )
          )
          .orderBy(desc(visites.date), desc(ordreTranche(visites.tranche)))
          .limit(60),
        tx
          .select({
            id: visites.id,
            date: visites.date,
            tranche: visites.tranche,
            actes: visites.actes,
            serieId: visites.serieId,
            soignanteId: soignantes.id,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
          })
          .from(visites)
          .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
          .where(
            and(
              eq(visites.patientId, patientId),
              eq(visites.statut, "prevue"),
              gte(visites.date, aujourdhui)
            )
          )
          .orderBy(asc(visites.date), asc(ordreTranche(visites.tranche)))
          .limit(30),
        tx
          .select({
            id: seriesVisites.id,
            dateDebut: seriesVisites.dateDebut,
            dateFin: seriesVisites.dateFin,
            frequence: seriesVisites.frequence,
            joursSemaine: seriesVisites.joursSemaine,
            tranches: seriesVisites.tranches,
            actes: seriesVisites.actes,
            soignanteId: soignantes.id,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
            restantes: sql<number>`(select count(*)::int from visites v
              where v.serie_id = ${seriesVisites.id} and v.statut = 'prevue' and v.date >= ${aujourdhui})`,
            prochaineDate: sql<string | null>`(select min(v.date) from visites v
              where v.serie_id = ${seriesVisites.id} and v.statut = 'prevue' and v.date >= ${aujourdhui})`,
          })
          .from(seriesVisites)
          .innerJoin(soignantes, eq(soignantes.id, seriesVisites.soignanteId))
          .where(eq(seriesVisites.patientId, patientId))
          .orderBy(desc(seriesVisites.dateDebut)),
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

      // Traçabilité des consultations (une ligne par patient et par période de 10 min,
      // même si la page est rechargée) : identifiants uniquement, aucun contenu.
      await auditer(tx, {
        action: "patient_consulte",
        entite: "patient",
        entiteId: patientId,
        patientId,
        dedoublonnerMinutes: 10,
      });
      if (accessRows[0]) {
        await auditer(tx, {
          action: "acces_domicile_consulte",
          entite: "acces_domicile",
          entiteId: accessRows[0].id,
          patientId,
          dedoublonnerMinutes: 10,
        });
      }
      if (ordonnancesWithUrl.some((o) => o.signedUrl) || documentsWithUrl.some((d) => d.signedUrl)) {
        await auditer(tx, {
          action: "documents_consultes",
          entite: "patient",
          entiteId: patientId,
          patientId,
          dedoublonnerMinutes: 10,
        });
      }

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
        access: lireAcces(accessRows[0], patientId),
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
          tranche: row.tranche,
          actes: row.actes,
          statut: row.statut,
          soignante: {
            id: row.soignanteId,
            prenom: row.soignantePrenom,
            nom: row.soignanteNom,
            couleur: row.soignanteCouleur,
          },
        })),
        prochaines: prochainesRows.map((row) => ({
          id: row.id,
          date: row.date,
          tranche: row.tranche,
          actes: row.actes,
          serieId: row.serieId,
          soignante: {
            id: row.soignanteId,
            prenom: row.soignantePrenom,
            nom: row.soignanteNom,
            couleur: row.soignanteCouleur,
          },
        })),
        series: serieRows
          .filter((row) => Number(row.restantes) > 0)
          .map((row) => ({
            id: row.id,
            dateDebut: row.dateDebut,
            dateFin: row.dateFin,
            frequence: row.frequence,
            joursSemaine: row.joursSemaine,
            tranches: row.tranches,
            actes: row.actes,
            restantes: Number(row.restantes),
            prochaineDate: row.prochaineDate,
            soignante: {
              id: row.soignanteId,
              prenom: row.soignantePrenom,
              nom: row.soignanteNom,
              couleur: row.soignanteCouleur,
            },
          })),
        documents: documentsWithUrl,
        prises: await lireHistoriquePrisesDansTx(tx, patientId),
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
