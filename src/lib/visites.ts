import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { getDemoVisiteActes, orDemo } from "@/lib/demo-data";
import { MESSAGE_ACTE_REQUIS, nettoyerActes } from "@/lib/actes";
import { ajouterJours } from "@/lib/recurrence";
import { ErreurMetier } from "@/lib/resultat";
import type { StatutVisite } from "@/lib/tournee";
import { soignantes, visites, visitesHistorique, type ChampHistorique } from "@/lib/schema";

export type Tx = Parameters<Parameters<typeof withSoignante>[1]>[0];

export type EntreeHistorique = {
  visiteId: string;
  champ: ChampHistorique;
  ancienne: string | null;
  nouvelle: string | null;
};

export const texteActes = (actes: string[]) => (actes.length > 0 ? actes.join(", ") : null);

/**
 * Trace les modifications d'une visite (qui, quand, quel champ, avant / après).
 * Les valeurs vont en base uniquement — jamais dans les logs applicatifs.
 * Les entrées sans changement réel sont ignorées.
 */
export async function journaliser(tx: Tx, soignanteId: string, entrees: EntreeHistorique[]) {
  const lignes = entrees
    .filter((e) => e.ancienne !== e.nouvelle)
    .map((e) => ({
      visiteId: e.visiteId,
      soignanteId,
      champ: e.champ,
      ancienneValeur: e.ancienne,
      nouvelleValeur: e.nouvelle,
    }));
  for (let i = 0; i < lignes.length; i += 400) {
    await tx.insert(visitesHistorique).values(lignes.slice(i, i + 400));
  }
}

/**
 * Change le statut d'une visite. Une visite ne peut pas être validée
 * (« faite ») sans au moins un acte : si `actes` est fourni, ils sont
 * enregistrés dans la même transaction que la validation.
 */
export async function changerStatutVisite(
  soignanteId: string,
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<void> {
  const actesRecus = actes === undefined ? undefined : nettoyerActes(actes);

  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [visite] = await tx
          .select({
            statut: visites.statut,
            actes: visites.actes,
            heureReelle: visites.heureReelle,
          })
          .from(visites)
          .where(eq(visites.id, visiteId))
          .limit(1);
        if (!visite) throw new ErreurMetier("Visite introuvable.");
        if (visite.statut === "annulee") throw new ErreurMetier("Cette visite est annulée.");

        const actesFinaux = actesRecus ?? visite.actes;
        if (statut === "faite" && actesFinaux.length === 0) {
          throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
        }

        await tx
          .update(visites)
          .set({
            statut,
            actes: actesFinaux,
            heureReelle: statut === "faite" ? (visite.heureReelle ?? new Date()) : null,
          })
          .where(eq(visites.id, visiteId));

        await journaliser(tx, soignanteId, [
          { visiteId, champ: "statut", ancienne: visite.statut, nouvelle: statut },
          { visiteId, champ: "actes", ancienne: texteActes(visite.actes), nouvelle: texteActes(actesFinaux) },
        ]);
      }),
    () => {
      // Démo hors-ligne : aucune écriture, mais la règle « pas de validation sans acte » reste appliquée.
      const connus = actesRecus ?? getDemoVisiteActes(visiteId);
      if (statut === "faite" && connus.length === 0) throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
    }
  );
}

/** Corrige les actes d'un passage (y compris déjà validé : ajout d'un acte oublié). */
export async function corrigerActesVisite(
  soignanteId: string,
  visiteId: string,
  actes: string[]
): Promise<void> {
  const nouveaux = nettoyerActes(actes);

  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [visite] = await tx
          .select({ statut: visites.statut, actes: visites.actes })
          .from(visites)
          .where(eq(visites.id, visiteId))
          .limit(1);
        if (!visite) throw new ErreurMetier("Visite introuvable.");
        if (visite.statut === "annulee") throw new ErreurMetier("Cette visite est annulée.");
        if (visite.statut === "faite" && nouveaux.length === 0) {
          throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
        }

        await tx
          .update(visites)
          .set({ actes: nouveaux, dureeEstimeeMin: nouveaux.length > 0 ? nouveaux.length * 15 : null })
          .where(eq(visites.id, visiteId));
        await journaliser(tx, soignanteId, [
          { visiteId, champ: "actes", ancienne: texteActes(visite.actes), nouvelle: texteActes(nouveaux) },
        ]);
      }),
    () => undefined
  );
}

/**
 * Décale une visite prévue au lendemain en un geste : la visite passe en
 * « reportee » et une nouvelle visite « prevue » est créée demain, sur la même
 * tranche, avec les mêmes actes (modifiable ensuite). Pas de doublon : si le
 * patient a déjà une visite demain sur cette tranche, rien n'est créé ; et une
 * visite déjà reportée ne peut pas l'être une seconde fois.
 */
export async function decalerVisiteAuLendemain(
  soignanteId: string,
  visiteId: string
): Promise<{ creee: boolean; date: string }> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        // Le statut conditionnel fait office de verrou : deux appels simultanés
        // ne peuvent pas décaler la même visite deux fois.
        const [origine] = await tx
          .update(visites)
          .set({ statut: "reportee", heureReelle: null })
          .where(and(eq(visites.id, visiteId), eq(visites.statut, "prevue")))
          .returning();
        if (!origine) {
          throw new ErreurMetier("Cette visite n'est plus à faire : elle ne peut pas être décalée.");
        }

        const demain = ajouterJours(origine.date, 1);
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${visites.ordreDansPassage}), 0)` })
          .from(visites)
          .where(and(eq(visites.date, demain), eq(visites.passage, origine.passage)));

        const [creee] = await tx
          .insert(visites)
          .values({
            patientId: origine.patientId,
            soignanteId: origine.soignanteId,
            date: demain,
            tranche: origine.tranche,
            ordreDansPassage: Number(max) + 1,
            actes: origine.actes,
            dureeEstimeeMin: origine.dureeEstimeeMin,
            statut: "prevue",
            reportDeId: origine.id,
          })
          .onConflictDoNothing()
          .returning({ id: visites.id });

        await journaliser(tx, soignanteId, [
          { visiteId, champ: "statut", ancienne: "prevue", nouvelle: "reportee" },
          ...(creee
            ? [{ visiteId: creee.id, champ: "date" as const, ancienne: origine.date, nouvelle: demain }]
            : []),
        ]);

        return { creee: Boolean(creee), date: demain };
      }),
    () => ({ creee: true, date: "" })
  );
}

export type EntreeHistoriqueLue = {
  id: string;
  createdAt: string;
  champ: ChampHistorique;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  soignantePrenom: string | null;
};

export async function lireHistoriqueVisite(
  soignanteId: string,
  visiteId: string
): Promise<EntreeHistoriqueLue[]> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const rows = await tx
          .select({
            id: visitesHistorique.id,
            createdAt: visitesHistorique.createdAt,
            champ: visitesHistorique.champ,
            ancienneValeur: visitesHistorique.ancienneValeur,
            nouvelleValeur: visitesHistorique.nouvelleValeur,
            soignantePrenom: soignantes.prenom,
          })
          .from(visitesHistorique)
          .leftJoin(soignantes, eq(soignantes.id, visitesHistorique.soignanteId))
          .where(eq(visitesHistorique.visiteId, visiteId))
          .orderBy(desc(visitesHistorique.createdAt))
          .limit(50);
        return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      }),
    () => []
  );
}
