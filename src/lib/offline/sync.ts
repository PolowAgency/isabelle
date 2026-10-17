import "server-only";

import { desc, eq } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { orDemo } from "@/lib/demo-data";
import { ErreurMetier } from "@/lib/resultat";
import { soignantes, visites, visitesHistorique } from "@/lib/schema";
import { changerStatutDansTx, decalerDansTx } from "@/lib/visites";
import { compacterFile, evaluerOperation, versResultat, type EtatServeur } from "./regles";
import type { OperationHorsLigne, ResultatOperation } from "./types";

/**
 * Rejoue les actions faites hors-ligne, dans l'ordre. Chaque opération a sa
 * propre transaction : la visite est verrouillée (FOR UPDATE), comparée à l'état
 * que l'appareil connaissait, puis appliquée ou signalée en conflit. Jamais
 * d'écrasement d'un passage modifié entre-temps par une collègue ; rejouer deux
 * fois la même opération est sans effet.
 */
export async function rejouerOperations(
  soignanteId: string,
  operations: OperationHorsLigne[]
): Promise<ResultatOperation[]> {
  const resultats: ResultatOperation[] = [];

  for (const op of compacterFile(operations)) {
    const resultat = await orDemo<ResultatOperation>(
      () =>
        withSoignante(soignanteId, async (tx) => {
          const [visite] = await tx
            .select({ id: visites.id, statut: visites.statut })
            .from(visites)
            .where(eq(visites.id, op.visiteId))
            .for("update");

          let serveur: EtatServeur | null = null;
          if (visite) {
            const [dernier] = await tx
              .select({ prenom: soignantes.prenom, quand: visitesHistorique.createdAt })
              .from(visitesHistorique)
              .leftJoin(soignantes, eq(soignantes.id, visitesHistorique.soignanteId))
              .where(eq(visitesHistorique.visiteId, visite.id))
              .orderBy(desc(visitesHistorique.createdAt))
              .limit(1);
            serveur = {
              statut: visite.statut,
              parPrenom: dernier?.prenom ?? null,
              quand: dernier?.quand ? dernier.quand.toISOString() : null,
            };
          }

          const decision = evaluerOperation(op, serveur);
          if (decision.action === "appliquer") {
            try {
              if (op.type === "marquer") {
                await changerStatutDansTx(tx, soignanteId, op.visiteId, op.statut, op.actes);
              } else {
                await decalerDansTx(tx, soignanteId, op.visiteId);
              }
            } catch (e) {
              if (e instanceof ErreurMetier) {
                return { id: op.id, etat: "erreur", message: e.message } satisfies ResultatOperation;
              }
              throw e;
            }
          }
          return versResultat(op, serveur, decision);
        }),
      () => ({ id: op.id, etat: "applique" as const })
    );
    resultats.push(resultat);
  }

  if (resultats.length > 0) {
    await withSoignante(soignanteId, (tx) =>
      auditer(tx, { action: "operations_hors_ligne_rejouees", entite: "hors_ligne", dedoublonnerMinutes: 1 })
    ).catch(() => undefined); // la traçabilité ne doit pas faire échouer une synchronisation déjà appliquée
  }
  return resultats;
}
