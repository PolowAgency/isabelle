import "server-only";

import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { ajouterJours } from "@/lib/date";
import { getDemoAudit, orDemo } from "@/lib/demo-data";
import { auditLog, patients, soignantes } from "@/lib/schema";

export type LigneAudit = {
  id: string;
  createdAt: string;
  action: string;
  entite: string;
  soignante: string | null;
  patient: string | null;
};

export const MAX_LIGNES_AUDIT = 500;

/** Réservé aux admins : la RLS d'audit_log n'autorise la lecture qu'à eux. */
export async function lireJournalAudit(
  adminId: string,
  filtres: { du: string; au: string; soignanteId?: string | null; patient?: string | null }
): Promise<{ lignes: LigneAudit[]; tronque: boolean }> {
  const motif = filtres.patient?.trim()
    ? `%${filtres.patient.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    : null;

  return orDemo(
    () =>
      withSoignante(adminId, async (tx) => {
        await auditer(tx, { action: "journal_consulte", entite: "audit", dedoublonnerMinutes: 10 });

        const rows = await tx
          .select({
            id: auditLog.id,
            createdAt: auditLog.createdAt,
            action: auditLog.action,
            entite: auditLog.entite,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            patientPrenom: patients.prenom,
            patientNom: patients.nom,
          })
          .from(auditLog)
          .leftJoin(soignantes, eq(soignantes.id, auditLog.soignanteId))
          .leftJoin(patients, eq(patients.id, auditLog.patientId))
          .where(
            and(
              // Bornes en jours de Paris : [du 00:00, lendemain de « au » 00:00[
              gte(auditLog.createdAt, sql`(${filtres.du}::date)::timestamp at time zone 'Europe/Paris'`),
              lt(
                auditLog.createdAt,
                sql`(${ajouterJours(filtres.au, 1)}::date)::timestamp at time zone 'Europe/Paris'`
              ),
              filtres.soignanteId ? eq(auditLog.soignanteId, filtres.soignanteId) : undefined,
              motif ? or(ilike(patients.nom, motif), ilike(patients.prenom, motif)) : undefined
            )
          )
          .orderBy(desc(auditLog.createdAt))
          .limit(MAX_LIGNES_AUDIT + 1);

        return {
          tronque: rows.length > MAX_LIGNES_AUDIT,
          lignes: rows.slice(0, MAX_LIGNES_AUDIT).map((r) => ({
            id: r.id,
            createdAt: r.createdAt.toISOString(),
            action: r.action,
            entite: r.entite,
            soignante: r.soignantePrenom ? `${r.soignantePrenom} ${r.soignanteNom}` : null,
            patient: r.patientPrenom ? `${r.patientPrenom} ${r.patientNom}` : null,
          })),
        };
      }),
    () => getDemoAudit()
  );
}
