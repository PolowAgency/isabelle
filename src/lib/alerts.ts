import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { ajouterJours, todayISO } from "@/lib/date";
import {
  getDemoAlerts,
  getDemoAlertesCount,
  isDemoModeEnabled,
  isOfflineDbError,
  orDemo,
} from "@/lib/demo-data";
import { listerAbsences, type AbsenceLigne } from "@/lib/absences";
import { listerAlertesPrises, type PriseAlerte } from "@/lib/prises";
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
  /** Absences en cours ou dans les 30 prochains jours (toute l'équipe). */
  absences: AbsenceLigne[];
  /** Prises de traitement refusées ou non administrées, pas encore prises en compte. */
  prises: PriseAlerte[];
}> {
  const prises = await listerAlertesPrises(soignanteId);
  const transferts = await listerTransferts(soignanteId);
  const limiteAbsences = ajouterJours(todayISO(), 30);
  const absences = (await listerAbsences(soignanteId)).filter((a) => a.dateDebut <= limiteAbsences);
  const limite30 = ajouterJours(todayISO(), 30);
  const hier = ajouterJours(todayISO(), -1);
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
            sql`${ordonnances.dateFin} <= ${limite30}::date`
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
            eq(visites.date, hier)
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
        absences,
        prises,
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
        absences,
        prises,
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
  const limite30 = ajouterJours(todayISO(), 30);
  const hier = ajouterJours(todayISO(), -1);
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const rows = await tx.execute<{ total: number }>(sql`
          select (
            (select count(*) from ordonnances o
              where o.active = true and o.date_fin is not null
                and o.date_fin <= ${limite30}::date)
            + (select count(*) from transmissions t
              where t.importance = 'urgent' and not (${soignanteId}::uuid = any(t.lue_par)))
            + (select count(*) from visites v
              where v.statut = 'prevue' and v.date = ${hier}::date)
            + (select count(*) from prises_traitement p
              join visites pv on pv.id = p.visite_id
              where p.statut <> 'administre' and p.alerte_traitee_at is null
                and pv.date >= ${ajouterJours(todayISO(), -14)}::date)
            + (select count(distinct coalesce(x.absence_id, x.id)) from transferts x
              where x.vers_soignante_id = ${soignanteId}::uuid and x.statut = 'en_attente')
            + (select count(distinct coalesce(x.absence_id, x.id)) from transferts x
              where x.de_soignante_id = ${soignanteId}::uuid and x.statut <> 'en_attente'
                and x.reponse_vue = false)
          )::int as total
        `);
        return Number(rows[0]?.total ?? 0);
      }),
    () => getDemoAlertesCount(soignanteId)
  );
}
