import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import {
  getDemoPatientsList,
  getDemoSecteurs,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import { patients, secteurs } from "@/lib/schema";

export type PatientListItemData = {
  id: string;
  prenom: string;
  nom: string;
  adresse: string | null;
  complementAdresse: string | null;
  codePostal: string | null;
  ville: string | null;
  secteurId: string | null;
  secteurNom: string;
  secteurCouleur: string;
  secteurOrdre: number;
  transmissionNonLue: boolean;
  ordonnanceAlerte: boolean;
};

export type PatientListSector = {
  id: string;
  nom: string;
  couleur: string;
  ordre: number;
  count: number;
};

export async function getPatientsList(soignanteId: string): Promise<{
  patients: PatientListItemData[];
  secteurs: PatientListSector[];
}> {
  try {
    return await withSoignante(soignanteId, async (tx) => {
      const patientRows = await tx
        .select({
          id: patients.id,
          prenom: patients.prenom,
          nom: patients.nom,
          adresse: patients.adresse,
          complementAdresse: patients.complementAdresse,
          codePostal: patients.codePostal,
          ville: patients.ville,
          secteurId: secteurs.id,
          secteurNom: sql<string>`coalesce(${secteurs.nom}, 'Sans secteur')`,
          secteurCouleur: sql<string>`coalesce(${secteurs.couleur}, '#d8cfba')`,
          secteurOrdre: sql<number>`coalesce(${secteurs.ordre}, 999)`,
          transmissionNonLue: sql<boolean>`exists (
            select 1 from transmissions t
            where t.patient_id = ${patients.id}
              and not (${soignanteId}::uuid = any(t.lue_par))
          )`,
          ordonnanceAlerte: sql<boolean>`exists (
            select 1 from ordonnances o
            where o.patient_id = ${patients.id}
              and o.active = true
              and o.date_fin is not null
              and o.date_fin <= (current_date + interval '15 days')
          )`,
        })
        .from(patients)
        .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
        .where(eq(patients.actif, true))
        .orderBy(
          sql`coalesce(${secteurs.ordre}, 999)`,
          asc(patients.nom),
          asc(patients.prenom)
        );

      const secteurRows = await tx
        .select({
          id: secteurs.id,
          nom: secteurs.nom,
          couleur: secteurs.couleur,
          ordre: secteurs.ordre,
          count: sql<number>`count(${patients.id})`,
        })
        .from(secteurs)
        .leftJoin(
          patients,
          and(eq(patients.secteurId, secteurs.id), eq(patients.actif, true))
        )
        .groupBy(secteurs.id)
        .orderBy(asc(secteurs.ordre), asc(secteurs.nom));

      return {
        patients: patientRows as PatientListItemData[],
        secteurs: secteurRows
          .filter((secteur) => secteur.count > 0)
          .map((secteur) => ({
            ...secteur,
            count: Number(secteur.count),
          })) as PatientListSector[],
      };
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoPatientsList(soignanteId) as {
        patients: PatientListItemData[];
        secteurs: PatientListSector[];
      };
    }
    throw error;
  }
}

export type SecteurOption = { id: string; nom: string; couleur: string; ordre: number };

/** Tous les secteurs (y compris ceux sans patient actif) — pour le formulaire "nouveau patient". */
export async function getAllSecteurs(soignanteId: string): Promise<SecteurOption[]> {
  try {
    return await withSoignante(soignanteId, (tx) =>
      tx
        .select({
          id: secteurs.id,
          nom: secteurs.nom,
          couleur: secteurs.couleur,
          ordre: secteurs.ordre,
        })
        .from(secteurs)
        .orderBy(asc(secteurs.ordre), asc(secteurs.nom))
    );
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoSecteurs();
    }
    throw error;
  }
}
