import { and, asc, eq, ne, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import {
  getDemoTourneeVisites,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import { visites, patients, secteurs, soignantes } from "@/lib/schema";

export type Passage = "matin" | "midi" | "soir";
export type VueTournee = "mine" | "equipe";
export type StatutVisite = "prevue" | "faite" | "absent" | "reportee" | "annulee";

export type VisiteLigne = {
  id: string;
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  adresse: string | null;
  ville: string | null;
  secteurId: string | null;
  secteurNom: string;
  secteurOrdre: number;
  ordreDansPassage: number;
  actes: string[];
  dureeEstimeeMin: number | null;
  statut: StatutVisite;
  heureReelle: Date | null;
  serieId: string | null;
  soignanteId: string;
  soignantePrenom: string;
  soignanteCouleur: string;
  transmissionNonLue: boolean;
  ordonnanceAlerte: boolean;
};

/**
 * Une seule requête (jointures + sous-requêtes EXISTS pour les pastilles
 * d'alerte) — jamais de N+1 sur une liste de 40 à 60 visites.
 */
export async function getTourneeVisites(
  soignanteId: string,
  date: string,
  passage: Passage,
  vue: VueTournee
): Promise<VisiteLigne[]> {
  try {
    return await withSoignante(soignanteId, async (tx) => {
      // Les visites annulées restent en base (traçabilité) mais ne sont plus à faire.
      const conditions = [
        eq(visites.date, date),
        eq(visites.passage, passage),
        ne(visites.statut, "annulee"),
      ];
      if (vue === "mine") {
        conditions.push(eq(visites.soignanteId, soignanteId));
      }

      const rows = await tx
        .select({
          id: visites.id,
          patientId: visites.patientId,
          patientPrenom: patients.prenom,
          patientNom: patients.nom,
          adresse: patients.adresse,
          ville: patients.ville,
          secteurId: secteurs.id,
          secteurNom: secteurs.nom,
          secteurOrdre: sql<number>`coalesce(${secteurs.ordre}, 999)`,
          ordreDansPassage: visites.ordreDansPassage,
          actes: visites.actes,
          dureeEstimeeMin: visites.dureeEstimeeMin,
          statut: visites.statut,
          heureReelle: visites.heureReelle,
          serieId: visites.serieId,
          soignanteId: visites.soignanteId,
          soignantePrenom: soignantes.prenom,
          soignanteCouleur: soignantes.couleur,
          transmissionNonLue: sql<boolean>`exists (
            select 1 from transmissions t
            where t.patient_id = ${visites.patientId}
              and not (${soignanteId}::uuid = any(t.lue_par))
          )`,
          ordonnanceAlerte: sql<boolean>`exists (
            select 1 from ordonnances o
            where o.patient_id = ${visites.patientId}
              and o.active = true
              and o.date_fin is not null
              and o.date_fin <= (current_date + interval '15 days')
          )`,
        })
        .from(visites)
        .innerJoin(patients, eq(patients.id, visites.patientId))
        .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
        .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
        .where(and(...conditions))
        .orderBy(
          sql`coalesce(${secteurs.ordre}, 999)`,
          asc(visites.ordreDansPassage)
        );

      return rows as VisiteLigne[];
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoTourneeVisites(soignanteId, date, passage, vue) as VisiteLigne[];
    }
    throw error;
  }
}

export async function updateVisiteStatut(
  soignanteId: string,
  visiteId: string,
  statut: StatutVisite
): Promise<void> {
  try {
    await withSoignante(soignanteId, (tx) =>
      tx
        .update(visites)
        .set({
          statut,
          heureReelle: statut === "faite" ? new Date() : null,
        })
        .where(eq(visites.id, visiteId))
    );
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return;
    }
    throw error;
  }
}
