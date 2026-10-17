import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { orDemo } from "@/lib/demo-data";
import { nettoyerActes } from "@/lib/actes";
import {
  dateFinDepuisDuree,
  genererDatesSerie,
  normaliserJoursSemaine,
  type UniteDuree,
} from "@/lib/recurrence";
import { todayISO } from "@/lib/date";
import { ErreurMetier } from "@/lib/resultat";
import { auditer } from "@/lib/audit";
import { journaliser, texteActes } from "@/lib/visites";
import { TRANCHES, estTranche, passageDeTranche, type Tranche } from "@/lib/tranches";
import { seriesVisites, visites, FREQUENCES_SERIE, type FrequenceSerie } from "@/lib/schema";

export type PorteeModification = "cette" | "suivantes";

export type CreerSerieInput = {
  patientId: string;
  dateDebut: string;
  frequence: FrequenceSerie;
  joursSemaine?: number[];
  /** Un ou plusieurs passages par jour (ex. matin + soir). */
  tranches: Tranche[];
  actes: string[];
  dureeEstimeeMin: number | null;
  fin: { type: "date"; dateFin: string } | { type: "duree"; unite: UniteDuree; nombre: number };
};

export type CreerSerieResultat = {
  serieId: string | null;
  crees: number;
  /** Visites non créées car le patient avait déjà une visite sur cette tranche ce jour-là. */
  ignorees: number;
};

const TAILLE_LOT = 400;

/**
 * Calcule les dates de la série, puis crée la série et toutes ses visites dans
 * une seule transaction : soit tout est créé, soit rien.
 */
export async function creerSerieVisites(
  soignanteId: string,
  input: CreerSerieInput
): Promise<CreerSerieResultat> {
  if (!input.patientId) throw new ErreurMetier("Patient introuvable.");
  if (!FREQUENCES_SERIE.includes(input.frequence)) throw new ErreurMetier("Fréquence invalide.");

  const tranches = TRANCHES.filter((t) => input.tranches?.includes(t));
  if (tranches.length === 0) throw new ErreurMetier("Choisissez au moins une tranche horaire.");
  const passages = Array.from(new Set(tranches.map(passageDeTranche)));

  if (input.dateDebut < todayISO()) {
    throw new ErreurMetier("La série ne peut pas commencer dans le passé.");
  }

  const dateFin =
    input.fin.type === "date"
      ? input.fin.dateFin
      : dateFinDepuisDuree(input.dateDebut, input.fin.unite, input.fin.nombre);

  const joursSemaine = normaliserJoursSemaine(input.joursSemaine);
  const dates = genererDatesSerie({
    dateDebut: input.dateDebut,
    dateFin,
    frequence: input.frequence,
    joursSemaine,
  });
  if (dates.length === 0) throw new ErreurMetier("Aucune date ne correspond à cette récurrence.");

  const actes = nettoyerActes(input.actes);
  const duree = input.dureeEstimeeMin && input.dureeEstimeeMin > 0 ? input.dureeEstimeeMin : null;

  return orDemo<CreerSerieResultat>(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [serie] = await tx
          .insert(seriesVisites)
          .values({
            patientId: input.patientId,
            soignanteId,
            dateDebut: dates[0],
            dateFin: dates[dates.length - 1],
            frequence: input.frequence,
            joursSemaine,
            tranches,
            actes,
            dureeEstimeeMin: duree,
            createdBy: soignanteId,
          })
          .returning({ id: seriesVisites.id });

        await auditer(tx, {
          action: "serie_creee",
          entite: "serie",
          entiteId: serie.id,
          patientId: input.patientId,
        });

        // Un seul aller-retour pour connaître le dernier ordre de chaque
        // (jour, passage) de la période, au lieu d'un max() par visite.
        // L'ordre reste numéroté par passage (matin / midi / soir).
        const maxRows = await tx
          .select({
            date: visites.date,
            passage: visites.passage,
            max: sql<number>`max(${visites.ordreDansPassage})`,
          })
          .from(visites)
          .where(
            and(
              gte(visites.date, dates[0]),
              lte(visites.date, dates[dates.length - 1]),
              inArray(visites.passage, passages)
            )
          )
          .groupBy(visites.date, visites.passage);
        const ordreMax = new Map(maxRows.map((r) => [`${r.date}|${r.passage}`, Number(r.max)]));

        const rows: (typeof visites.$inferInsert)[] = [];
        for (const date of dates) {
          for (const tranche of tranches) {
            const passage = passageDeTranche(tranche);
            const cle = `${date}|${passage}`;
            const ordre = (ordreMax.get(cle) ?? 0) + 1;
            ordreMax.set(cle, ordre);
            rows.push({
              patientId: input.patientId,
              soignanteId,
              date,
              tranche,
              ordreDansPassage: ordre,
              actes,
              dureeEstimeeMin: duree,
              statut: "prevue",
              serieId: serie.id,
            });
          }
        }

        let crees = 0;
        for (let i = 0; i < rows.length; i += TAILLE_LOT) {
          const inserted = await tx
            .insert(visites)
            .values(rows.slice(i, i + TAILLE_LOT))
            .onConflictDoNothing()
            .returning({ id: visites.id });
          crees += inserted.length;
        }

        if (crees === 0) {
          // Rien à créer : on annule la transaction pour ne pas laisser une série vide.
          throw new ErreurMetier("Ce patient a déjà une visite sur toutes ces dates.");
        }

        return { serieId: serie.id, crees, ignorees: rows.length - crees };
      }),
    () => ({ serieId: null, crees: dates.length * tranches.length, ignorees: 0 })
  );
}

/**
 * Visites visées par une modification : « cette seule » ou « celle-ci et les
 * suivantes de la série » — sur la même tranche (une série matin + soir se
 * modifie créneau par créneau).
 */
async function visitesCibles(
  tx: Parameters<Parameters<typeof withSoignante>[1]>[0],
  visiteId: string,
  portee: PorteeModification
) {
  const [visite] = await tx
    .select({
      id: visites.id,
      date: visites.date,
      tranche: visites.tranche,
      serieId: visites.serieId,
      statut: visites.statut,
    })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) throw new ErreurMetier("Visite introuvable.");

  if (portee === "suivantes" && visite.serieId) {
    // Seules les visites encore « prevue » sont touchées : faites, absentes,
    // reportées et annulées sont des faits, on n'y revient pas ici.
    return {
      condition: and(
        eq(visites.serieId, visite.serieId),
        eq(visites.tranche, visite.tranche),
        gte(visites.date, visite.date),
        eq(visites.statut, "prevue")
      ),
    };
  }

  if (visite.statut !== "prevue") {
    throw new ErreurMetier("Cette visite est déjà traitée : elle ne peut plus être modifiée ici.");
  }
  return { condition: eq(visites.id, visiteId) };
}

export async function modifierVisiteSerie(
  soignanteId: string,
  input: {
    visiteId: string;
    portee: PorteeModification;
    actes: string[];
    dureeEstimeeMin: number | null;
    /** Nouvelle tranche (déplacement du passage) ; omise = inchangée. */
    tranche?: Tranche;
  }
): Promise<{ modifiees: number; ignorees: number }> {
  const duree = input.dureeEstimeeMin && input.dureeEstimeeMin > 0 ? input.dureeEstimeeMin : null;
  if (input.tranche !== undefined && !estTranche(input.tranche)) {
    throw new ErreurMetier("Tranche horaire invalide.");
  }
  const nouvelleTranche = input.tranche;

  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const cible = await visitesCibles(tx, input.visiteId, input.portee);
        const cibles = await tx
          .select({ id: visites.id, actes: visites.actes, tranche: visites.tranche })
          .from(visites)
          .where(cible.condition);
        const avant = new Map(cibles.map((c) => [c.id, c]));
        // Actes historiques (saisie libre) déjà présents sur ces visites : tolérés.
        const actes = nettoyerActes(input.actes, cibles.flatMap((c) => c.actes));

        // Déplacer vers une tranche déjà occupée par ce patient ce jour-là
        // violerait l'unicité : ces visites-là restent où elles sont.
        const sansConflit = nouvelleTranche
          ? sql`not exists (
              select 1 from visites v2
              where v2.patient_id = ${visites.patientId}
                and v2.date = ${visites.date}
                and v2.tranche = ${nouvelleTranche}
                and v2.id <> ${visites.id}
            )`
          : undefined;

        const updated = await tx
          .update(visites)
          .set({
            actes,
            dureeEstimeeMin: duree,
            ...(nouvelleTranche ? { tranche: nouvelleTranche } : {}),
          })
          .where(and(cible.condition, sansConflit))
          .returning({ id: visites.id });

        await journaliser(
          tx,
          soignanteId,
          updated.flatMap(({ id }) => {
            const ancien = avant.get(id)!;
            return [
              { visiteId: id, champ: "actes" as const, ancienne: texteActes(ancien.actes), nouvelle: texteActes(actes) },
              ...(nouvelleTranche
                ? [{ visiteId: id, champ: "tranche" as const, ancienne: ancien.tranche, nouvelle: nouvelleTranche }]
                : []),
            ];
          })
        );
        return { modifiees: updated.length, ignorees: cibles.length - updated.length };
      }),
    () => ({ modifiees: 1, ignorees: 0 })
  );
}

/** « Supprimer » = annuler : la ligne reste en base (traçabilité, bilan), seul le statut change. */
export async function annulerVisiteSerie(
  soignanteId: string,
  input: { visiteId: string; portee: PorteeModification }
): Promise<{ annulees: number }> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const cible = await visitesCibles(tx, input.visiteId, input.portee);
        const updated = await tx
          .update(visites)
          .set({ statut: "annulee", heureReelle: null })
          .where(cible.condition)
          .returning({ id: visites.id });
        await journaliser(
          tx,
          soignanteId,
          updated.map(({ id }) => ({
            visiteId: id,
            champ: "statut" as const,
            ancienne: "prevue",
            nouvelle: "annulee",
          }))
        );
        return { annulees: updated.length };
      }),
    () => ({ annulees: 1 })
  );
}
