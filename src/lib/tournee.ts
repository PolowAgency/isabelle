import { and, asc, eq, ne, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { ajouterJours, todayISO } from "@/lib/date";
import {
  getDemoTourneeVisites,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import { visites, patients, secteurs, soignantes } from "@/lib/schema";
import { changerStatutVisite } from "@/lib/visites";
import { TRANCHES, type Passage, type Tranche } from "@/lib/tranches";
import type { PriseSaisie, TraitementDu } from "@/lib/prises-calc";

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
  codePostal: string | null;
  ville: string | null;
  patientTelephone: string | null;
  secteurId: string | null;
  secteurNom: string;
  secteurOrdre: number;
  tranche: Tranche;
  ordreDansPassage: number;
  actes: string[];
  dureeEstimeeMin: number | null;
  statut: StatutVisite;
  heureReelle: Date | null;
  heureArrivee: Date | null;
  serieId: string | null;
  soignanteId: string;
  soignantePrenom: string;
  soignanteCouleur: string;
  transmissionNonLue: boolean;
  ordonnanceAlerte: boolean;
  /** Traitements actifs du patient prévus à ce passage, et prises déjà renseignées pour cette visite. */
  traitementsDus: TraitementDu[];
  prises: PriseSaisie[];
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
    const limiteOrdonnance = ajouterJours(todayISO(), 15);
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
          codePostal: patients.codePostal,
          ville: patients.ville,
          patientTelephone: patients.telephone,
          secteurId: secteurs.id,
          secteurNom: secteurs.nom,
          secteurOrdre: sql<number>`coalesce(${secteurs.ordre}, 999)`,
          tranche: visites.tranche,
          ordreDansPassage: visites.ordreDansPassage,
          actes: visites.actes,
          dureeEstimeeMin: visites.dureeEstimeeMin,
          statut: visites.statut,
          heureReelle: visites.heureReelle,
          heureArrivee: visites.heureArrivee,
          serieId: visites.serieId,
          soignanteId: visites.soignanteId,
          soignantePrenom: soignantes.prenom,
          soignanteCouleur: soignantes.couleur,
          transmissionNonLue: sql<boolean>`exists (
            select 1 from transmissions t
            where t.patient_id = ${visites.patientId}
              and not (${soignanteId}::uuid = any(t.lue_par))
          )`,
          traitementsDus: sql<TraitementDu[]>`coalesce((
            select json_agg(json_build_object('id', t.id, 'libelle', t.libelle, 'dosage', t.dosage) order by t.libelle)
            from traitements t
            where t.patient_id = ${visites.patientId}
              and t.actif = true
              and ${visites.passage} = any(t.passages)
          ), '[]'::json)`,
          prises: sql<PriseSaisie[]>`coalesce((
            select json_agg(json_build_object('traitementId', p.traitement_id, 'statut', p.statut, 'commentaire', p.commentaire))
            from prises_traitement p
            where p.visite_id = ${visites.id}
          ), '[]'::json)`,
          ordonnanceAlerte: sql<boolean>`exists (
            select 1 from ordonnances o
            where o.patient_id = ${visites.patientId}
              and o.active = true
              and o.date_fin is not null
              and o.date_fin <= ${limiteOrdonnance}::date
          )`,
        })
        .from(visites)
        .innerJoin(patients, eq(patients.id, visites.patientId))
        .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
        .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
        .where(and(...conditions))
        .orderBy(
          ordreTranche(visites.tranche),
          asc(visites.ordreDansPassage),
          sql`coalesce(${secteurs.ordre}, 999)`,
          asc(visites.id)
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
  actes?: string[],
  prises?: PriseSaisie[]
): Promise<void> {
  return changerStatutVisite(soignanteId, visiteId, statut, actes, prises);
}
