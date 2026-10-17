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
import type { Passage } from "@/lib/tournee";
import { seriesVisites, visites, FREQUENCES_SERIE, type FrequenceSerie } from "@/lib/schema";

export const PASSAGES_VALIDES: Passage[] = ["matin", "midi", "soir"];

export type PorteeModification = "cette" | "suivantes";

export type CreerSerieInput = {
  patientId: string;
  dateDebut: string;
  frequence: FrequenceSerie;
  joursSemaine?: number[];
  passages: Passage[];
  actes: string[];
  dureeEstimeeMin: number | null;
  fin: { type: "date"; dateFin: string } | { type: "duree"; unite: UniteDuree; nombre: number };
};

export type CreerSerieResultat = {
  serieId: string | null;
  crees: number;
  /** Jours où le patient avait déjà une visite sur ce passage (laissées telles quelles). */
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
  if (!input.patientId) throw new Error("Patient introuvable.");
  if (!FREQUENCES_SERIE.includes(input.frequence)) throw new Error("Fréquence invalide.");

  const passages = PASSAGES_VALIDES.filter((p) => input.passages?.includes(p));
  if (passages.length === 0) throw new Error("Choisissez au moins un passage.");

  if (input.dateDebut < todayISO()) {
    throw new Error("La série ne peut pas commencer dans le passé.");
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
  if (dates.length === 0) throw new Error("Aucune date ne correspond à cette récurrence.");

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
            passages,
            actes,
            dureeEstimeeMin: duree,
            createdBy: soignanteId,
          })
          .returning({ id: seriesVisites.id });

        // Un seul aller-retour pour connaître le dernier ordre de chaque
        // (jour, passage) de la période, au lieu d'un max() par visite.
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
          for (const passage of passages) {
            const cle = `${date}|${passage}`;
            const ordre = (ordreMax.get(cle) ?? 0) + 1;
            ordreMax.set(cle, ordre);
            rows.push({
              patientId: input.patientId,
              soignanteId,
              date,
              passage,
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
          throw new Error("Ce patient a déjà une visite sur toutes ces dates.");
        }

        return { serieId: serie.id, crees, ignorees: rows.length - crees };
      }),
    () => ({ serieId: null, crees: dates.length * passages.length, ignorees: 0 })
  );
}

/** Visites visées par une modification : « cette seule » ou « celle-ci et les suivantes de la série ». */
async function visitesCibles(
  tx: Parameters<Parameters<typeof withSoignante>[1]>[0],
  visiteId: string,
  portee: PorteeModification
) {
  const [visite] = await tx
    .select({ id: visites.id, date: visites.date, serieId: visites.serieId, statut: visites.statut })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) throw new Error("Visite introuvable.");

  if (portee === "suivantes" && visite.serieId) {
    // Seules les visites encore « prevue » sont touchées : faites, absentes,
    // reportées et annulées sont des faits, on n'y revient pas ici.
    return {
      serieId: visite.serieId,
      condition: and(
        eq(visites.serieId, visite.serieId),
        gte(visites.date, visite.date),
        eq(visites.statut, "prevue")
      ),
    };
  }

  if (visite.statut !== "prevue") {
    throw new Error("Cette visite est déjà traitée : elle ne peut plus être modifiée ici.");
  }
  return { serieId: null, condition: eq(visites.id, visiteId) };
}

export async function modifierVisiteSerie(
  soignanteId: string,
  input: {
    visiteId: string;
    portee: PorteeModification;
    actes: string[];
    dureeEstimeeMin: number | null;
  }
): Promise<{ modifiees: number }> {
  const actes = nettoyerActes(input.actes);
  const duree = input.dureeEstimeeMin && input.dureeEstimeeMin > 0 ? input.dureeEstimeeMin : null;

  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const cible = await visitesCibles(tx, input.visiteId, input.portee);
        const updated = await tx
          .update(visites)
          .set({ actes, dureeEstimeeMin: duree })
          .where(cible.condition)
          .returning({ id: visites.id });
        if (cible.serieId) {
          await tx
            .update(seriesVisites)
            .set({ actes, dureeEstimeeMin: duree })
            .where(eq(seriesVisites.id, cible.serieId));
        }
        return { modifiees: updated.length };
      }),
    () => ({ modifiees: 1 })
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
        return { annulees: updated.length };
      }),
    () => ({ annulees: 1 })
  );
}
