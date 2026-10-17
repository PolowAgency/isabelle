import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { getDemoJournalPassages, orDemo } from "@/lib/demo-data";
import { versCsv } from "@/lib/csv";
import { auditer } from "@/lib/audit";
import { ErreurMetier } from "@/lib/resultat";
import { MAX_JOURS_SERIE, ajouterJours } from "@/lib/recurrence";
import { ordreTranche } from "@/lib/tournee";
import { libelleTranche, estTranche } from "@/lib/tranches";
import { patients, soignantes, visites } from "@/lib/schema";
import { isAdmin } from "@/lib/team";
import type { PublicSoignante } from "@/lib/schema";

// Journal des passages et actes d'une période (bilan comptable, archivage).
// Réservé à Isabelle (toute l'équipe) ou à chaque soignante (ses passages).

export type LignePassage = {
  date: string;
  tranche: string;
  patient: string;
  soignante: string;
  actes: string;
  statut: string;
  heureReelle: string;
};

export type JournalPassages = { lignes: LignePassage[]; tronque: boolean };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_LIGNES_EXPORT = 20_000;

const STATUT_LABELS: Record<string, string> = {
  prevue: "Prévue",
  faite: "Faite",
  absent: "Absent",
  reportee: "Reportée",
  annulee: "Annulée",
};

const heureFr = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

export function periodeValide(du: string | undefined, au: string | undefined): { du: string; au: string } {
  if (!du || !au || !ISO_DATE.test(du) || !ISO_DATE.test(au)) {
    throw new ErreurMetier("Choisissez une période (date de début et de fin).");
  }
  if (au < du) throw new ErreurMetier("La date de fin précède la date de début.");
  if (au > ajouterJours(du, MAX_JOURS_SERIE - 1)) {
    throw new ErreurMetier(`La période ne peut pas dépasser ${MAX_JOURS_SERIE} jours.`);
  }
  return { du, au };
}

/**
 * Lit le journal d'une période. Une soignante non admin ne peut lire que ses
 * propres passages : le filtre est imposé ici, quelle que soit la demande.
 */
export async function lireJournalPassages(
  demandeur: PublicSoignante,
  options: { du: string; au: string; soignanteId?: string | null; limite?: number }
): Promise<JournalPassages> {
  const admin = isAdmin(demandeur);
  if (!admin && options.soignanteId && options.soignanteId !== demandeur.id) {
    throw new ErreurMetier("Vous ne pouvez exporter que vos propres passages.");
  }
  const filtre = admin ? (options.soignanteId ?? null) : demandeur.id;
  const limite = options.limite ?? MAX_LIGNES_EXPORT;

  const brut = await orDemo(
    () =>
      withSoignante(demandeur.id, async (tx) => {
        // Chaque export / consultation du journal est tracé (qui, quand, sur quelle période exclue).
        await auditer(tx, { action: "export_passages", entite: "export", dedoublonnerMinutes: 1 });
        return tx
          .select({
            date: visites.date,
            tranche: visites.tranche,
            patientNom: patients.nom,
            patientPrenom: patients.prenom,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            actes: visites.actes,
            statut: visites.statut,
            heureReelle: visites.heureReelle,
          })
          .from(visites)
          .innerJoin(patients, eq(patients.id, visites.patientId))
          .innerJoin(soignantes, eq(soignantes.id, visites.soignanteId))
          .where(
            and(
              gte(visites.date, options.du),
              lte(visites.date, options.au),
              filtre ? eq(visites.soignanteId, filtre) : undefined
            )
          )
          .orderBy(
            asc(visites.date),
            asc(ordreTranche(visites.tranche)),
            asc(patients.nom),
            asc(patients.prenom)
          )
          .limit(limite + 1);
      }),
    () => getDemoJournalPassages(options.du, options.au, filtre)
  );

  const tronque = brut.length > limite;
  const lignes = brut.slice(0, limite).map((r) => ({
    date: r.date,
    tranche: estTranche(r.tranche) ? libelleTranche(r.tranche) : r.tranche,
    patient: `${r.patientNom} ${r.patientPrenom}`,
    soignante: `${r.soignantePrenom} ${r.soignanteNom}`,
    actes: r.actes.join(" ; "),
    statut: STATUT_LABELS[r.statut] ?? r.statut,
    heureReelle: r.heureReelle ? heureFr.format(r.heureReelle) : "",
  }));
  return { lignes, tronque };
}

export const ENTETES_JOURNAL = ["Date", "Tranche", "Patient", "Soignante", "Actes", "Statut", "Heure réelle"];

export function journalVersCsv(lignes: LignePassage[]): string {
  return versCsv(
    ENTETES_JOURNAL,
    lignes.map((l) => [l.date, l.tranche, l.patient, l.soignante, l.actes, l.statut, l.heureReelle])
  );
}
