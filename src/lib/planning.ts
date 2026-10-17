import "server-only";

import { eq } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { orDemo } from "@/lib/demo-data";
import { ACTES } from "@/lib/actes";
import { fusionnerReglages, reglagesParDefaut, type ReglagesPlanning } from "@/lib/planning-calc";
import { ErreurMetier } from "@/lib/resultat";
import { actesDurees, reglagesPlanning } from "@/lib/schema";
import type { Tx } from "@/lib/visites";

/** Réglages de durée et de capacité, lus dans la transaction de l'appelant. */
export async function lireReglagesDansTx(tx: Tx): Promise<ReglagesPlanning> {
  const [durees, capacite] = await Promise.all([
    tx.select({ acte: actesDurees.acte, dureeMin: actesDurees.dureeMin }).from(actesDurees),
    tx
      .select({ valeur: reglagesPlanning.valeurInt })
      .from(reglagesPlanning)
      .where(eq(reglagesPlanning.cle, "capacite_tranche_min"))
      .limit(1),
  ]);
  return fusionnerReglages(durees, capacite[0]?.valeur ?? null);
}

export async function getReglagesPlanning(soignanteId: string): Promise<ReglagesPlanning> {
  return orDemo(
    () => withSoignante(soignanteId, (tx) => lireReglagesDansTx(tx)),
    () => reglagesParDefaut()
  );
}

/** Enregistre les durées par acte et la capacité d'une tranche (administrateur ; contrôlé aussi par la RLS). */
export async function enregistrerReglagesPlanning(
  soignanteId: string,
  entree: { durees: Record<string, number>; capaciteTrancheMin: number }
): Promise<ReglagesPlanning> {
  const valeursActes = new Set(ACTES.map((a) => a.value));
  const lignes = Object.entries(entree.durees);
  if (lignes.some(([acte]) => !valeursActes.has(acte))) throw new ErreurMetier("Acte non reconnu.");

  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        for (const [acte, dureeMin] of lignes) {
          await tx
            .insert(actesDurees)
            .values({ acte, dureeMin, updatedBy: soignanteId })
            .onConflictDoUpdate({ target: actesDurees.acte, set: { dureeMin, updatedAt: new Date(), updatedBy: soignanteId } });
        }
        await tx
          .insert(reglagesPlanning)
          .values({ cle: "capacite_tranche_min", valeurInt: entree.capaciteTrancheMin, updatedBy: soignanteId })
          .onConflictDoUpdate({
            target: reglagesPlanning.cle,
            set: { valeurInt: entree.capaciteTrancheMin, updatedAt: new Date(), updatedBy: soignanteId },
          });
        await auditer(tx, { action: "reglages_planning_modifies", entite: "reglages" });
        return lireReglagesDansTx(tx);
      }),
    () => fusionnerReglages(lignes.map(([acte, dureeMin]) => ({ acte, dureeMin })), entree.capaciteTrancheMin)
  );
}

