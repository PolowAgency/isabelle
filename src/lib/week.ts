import "server-only";

import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { getDemoWeekVisits, isDemoModeEnabled, isOfflineDbError } from "@/lib/demo-data";
import { patients, secteurs, soignantes, visites } from "@/lib/schema";
import { ordreTranche } from "@/lib/tournee";
import type { Tranche } from "@/lib/tranches";

export type WeekVisit = {
  id: string;
  date: string;
  passage: "matin" | "midi" | "soir";
  tranche: Tranche;
  statut: "prevue" | "faite" | "absent" | "reportee" | "annulee";
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  secteurNom: string;
  secteurOrdre: number;
  soignanteId: string;
  soignantePrenom: string;
  soignanteNom: string;
  soignanteCouleur: string;
};

export function startOfWeek(date = new Date()): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + diff);
  return next;
}

export function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export async function getWeekVisits(
  soignanteId: string,
  mondayIso: string,
  sundayIso: string
): Promise<WeekVisit[]> {
  try {
    return await withSoignante(soignanteId, async (tx) => {
      const rows = await tx
        .select({
          id: visites.id,
          date: visites.date,
          passage: visites.passage,
          tranche: visites.tranche,
          statut: visites.statut,
          patientId: patients.id,
          patientPrenom: patients.prenom,
          patientNom: patients.nom,
          secteurNom: sql<string>`coalesce(${secteurs.nom}, 'Sans secteur')`,
          secteurOrdre: sql<number>`coalesce(${secteurs.ordre}, 999)`,
          soignanteId: soignantes.id,
          soignantePrenom: soignantes.prenom,
          soignanteNom: soignantes.nom,
          soignanteCouleur: soignantes.couleur,
        })
        .from(visites)
        .innerJoin(patients, eq(patients.id, visites.patientId))
        .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
        .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
        .where(
          and(
            gte(visites.date, mondayIso),
            lte(visites.date, sundayIso),
            ne(visites.statut, "annulee")
          )
        )
        .orderBy(
          asc(visites.date),
          ordreTranche(visites.tranche),
          asc(sql`coalesce(${secteurs.ordre}, 999)`),
          asc(visites.ordreDansPassage)
        );

      return rows as WeekVisit[];
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoWeekVisits(mondayIso, sundayIso) as WeekVisit[];
    }
    throw error;
  }
}
