import { and, asc, eq, ne, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import {
  getDemoTourneeVisites,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import { visites, patients, secteurs, soignantes } from "@/lib/schema";
import { changerStatutVisite } from "@/lib/visites";
import { TRANCHES, type Passage, type Tranche } from "@/lib/tranches";

export type { Passage, Tranche };
/** `jour` = toute la journée, groupée par tranche horaire. */
export type VuePassage = Passage | "jour";
/** Rang chronologique d'une tranche (le tri alphabétique placerait « 10-12 » avant « 6-8 »). */
export function ordreTranche(colonne: typeof visites.tranche) {
  const liste = TRANCHES.map((t) => `'${t}'`).join(", ");
  return sql`array_position(array[${sql.raw(liste)}]::text[], ${colonne})`;
}

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
  tranche: Tranche;
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
  passage: VuePassage,
  vue: VueTournee
): Promise<VisiteLigne[]> {
  try {
    return await withSoignante(soignanteId, async (tx) => {
      // Les visites annulées restent en base (traçabilité) mais ne sont plus à faire.
      const conditions = [eq(visites.date, date), ne(visites.statut, "annulee")];
      if (passage !== "jour") conditions.push(eq(visites.passage, passage));
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
          tranche: visites.tranche,
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
          ordreTranche(visites.tranche),
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

/** Voir changerStatutVisite : refuse « faite » sans acte, journalise le changement. */
export async function updateVisiteStatut(
  soignanteId: string,
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<void> {
  return changerStatutVisite(soignanteId, visiteId, statut, actes);
}
