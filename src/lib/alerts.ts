import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import {
  getDemoAlerts,
  getDemoAlertesCount,
  isDemoModeEnabled,
  isOfflineDbError,
  orDemo,
} from "@/lib/demo-data";
import { listerTransferts, type TransfertsPourAlertes } from "@/lib/transferts";
import { ordonnances, patients, soignantes, transmissions, visites } from "@/lib/schema";

export type OrdonnanceAlert = {
  id: string;
  patientId: string;
  patientNom: string;
  patientPrenom: string;
  dateFin: string;
  prescripteur: string | null;
};

export type TransmissionAlert = {
  id: string;
  patientId: string;
  patientNom: string;
  patientPrenom: string;
  contenu: string;
  createdAt: string;
  soignantePrenom: string;
  soignanteNom: string;
};

export type VisitAlert = {
  id: string;
  patientId: string;
  patientNom: string;
  patientPrenom: string;
  date: string;
  passage: "matin" | "midi" | "soir";
  soignantePrenom: string;
  soignanteNom: string;
};

export async function getAlerts(soignanteId: string): Promise<{
  ordonnances: OrdonnanceAlert[];
  transmissions: TransmissionAlert[];
  visites: VisitAlert[];
  transferts: TransfertsPourAlertes;
}> {
  const transferts = await listerTransferts(soignanteId);
  try {
    return await withSoignante(soignanteId, async (tx) => {
      const ordonnancesRows = await tx
        .select({
          id: ordonnances.id,
          patientId: patients.id,
          patientNom: patients.nom,
          patientPrenom: patients.prenom,
          dateFin: ordonnances.dateFin,
          prescripteur: ordonnances.prescripteur,
        })
        .from(ordonnances)
        .innerJoin(patients, eq(patients.id, ordonnances.patientId))
        .where(
          and(
            eq(ordonnances.active, true),
            sql`${ordonnances.dateFin} is not null`,
            sql`${ordonnances.dateFin} <= current_date + interval '30 days'`
          )
        )
        .orderBy(asc(ordonnances.dateFin), asc(patients.nom), asc(patients.prenom));

      const transmissionRows = await tx
        .select({
          id: transmissions.id,
          patientId: patients.id,
          patientNom: patients.nom,
          patientPrenom: patients.prenom,
          contenu: transmissions.contenu,
          createdAt: transmissions.createdAt,
          soignantePrenom: soignantes.prenom,
          soignanteNom: soignantes.nom,
        })
        .from(transmissions)
        .innerJoin(patients, eq(patients.id, transmissions.patientId))
        .innerJoin(soignantes, eq(soignantes.id, transmissions.soignanteId))
        .where(
          and(
            eq(transmissions.importance, "urgent"),
            sql`not (${soignanteId}::uuid = any(${transmissions.luePar}))`
          )
        )
        .orderBy(desc(transmissions.createdAt));

      const visitRows = await tx
        .select({
          id: visites.id,
          patientId: patients.id,
          patientNom: patients.nom,
          patientPrenom: patients.prenom,
          date: visites.date,
          passage: visites.passage,
          soignantePrenom: soignantes.prenom,
          soignanteNom: soignantes.nom,
        })
        .from(visites)
        .innerJoin(patients, eq(patients.id, visites.patientId))
        .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
        .where(
          and(
            eq(visites.statut, "prevue"),
            eq(visites.date, sql<string>`(current_date - interval '1 day')::date`)
          )
        )
        .orderBy(asc(patients.nom), asc(patients.prenom));

      return {
        ordonnances: ordonnancesRows as OrdonnanceAlert[],
        transmissions: transmissionRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        visites: visitRows as VisitAlert[],
        transferts,
      };
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return {
        ...(getDemoAlerts() as {
          ordonnances: OrdonnanceAlert[];
          transmissions: TransmissionAlert[];
          visites: VisitAlert[];
        }),
        transferts,
      };
    }
    throw error;
  }
}

/**
 * Nombre d'éléments qui demandent une action (pastille de l'onglet Alertes) :
 * mêmes critères que la page, en une seule requête de comptage.
 */
export async function getAlertesCount(soignanteId: string): Promise<number> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const rows = await tx.execute<{ total: number }>(sql`
          select (
            (select count(*) from ordonnances o
              where o.active = true and o.date_fin is not null
                and o.date_fin <= current_date + interval '30 days')
            + (select count(*) from transmissions t
              where t.importance = 'urgent' and not (${soignanteId}::uuid = any(t.lue_par)))
            + (select count(*) from visites v
              where v.statut = 'prevue' and v.date = (current_date - interval '1 day')::date)
            + (select count(*) from transferts x
              where x.vers_soignante_id = ${soignanteId}::uuid and x.statut = 'en_attente')
            + (select count(*) from transferts x
              where x.de_soignante_id = ${soignanteId}::uuid and x.statut <> 'en_attente'
                and x.reponse_vue = false)
          )::int as total
        `);
        return Number(rows[0]?.total ?? 0);
      }),
    () => getDemoAlertesCount(soignanteId)
  );
}
