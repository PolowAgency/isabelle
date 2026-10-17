import { deplacerVisitesDansTranche } from "@/lib/ordre";
import { estOperationStatut, type InstantaneHL, type OperationHorsLigne, type OperationStatut, type ResultatOperation, type StatutVisiteHL } from "./types";

// Application locale des opérations sur l'instantané affiché (fonctions pures) :
// la tournée hors-ligne reflète immédiatement ce que l'on vient de faire, et
// retrouve l'état du serveur dès qu'un conflit est signalé.

function statutCible(op: OperationStatut): StatutVisiteHL {
  return op.type === "decaler" ? "reportee" : op.statut;
}

export function appliquerOperation(instantane: InstantaneHL, op: OperationHorsLigne): InstantaneHL {
  if (op.type === "arrivee") {
    return {
      ...instantane,
      visites: instantane.visites.map((v) =>
        v.id === op.visiteId && !v.heureArrivee ? { ...v, heureArrivee: new Date(op.creeLe).toISOString() } : v
      ),
    };
  }
  if (op.type === "deplacer") return deplacerLocalement(instantane, op.visiteId, op.sens);
  return {
    ...instantane,
    visites: instantane.visites.map((v) =>
      v.id === op.visiteId
        ? {
            ...v,
            statut: statutCible(op),
            actes: op.type === "marquer" && op.actes ? op.actes : v.actes,
            prises: op.type === "marquer" && op.prises ? op.prises : v.prises,
            heureReelle: op.type === "marquer" && op.statut === "faite" ? new Date(op.creeLe).toISOString() : null,
          }
        : v
    ),
  };
}

/** Déplace une visite d'un cran parmi celles de sa tranche (l'instantané ne contient que mes visites). */
function deplacerLocalement(instantane: InstantaneHL, visiteId: string, sens: "haut" | "bas"): InstantaneHL {
  return { ...instantane, visites: deplacerVisitesDansTranche(instantane.visites, visiteId, sens) };
}

/** Rejoue les opérations encore en attente par-dessus un instantané tout neuf du serveur. */
export function superposerFile(instantane: InstantaneHL, file: OperationHorsLigne[]): InstantaneHL {
  return file.reduce(appliquerOperation, instantane);
}

/** Après synchronisation : l'état du serveur fait foi en cas de conflit, sinon l'opération est confirmée. */
export function reconcilier(
  instantane: InstantaneHL,
  operations: OperationHorsLigne[],
  resultats: ResultatOperation[]
): InstantaneHL {
  let courant = instantane;
  for (const r of resultats) {
    const op = operations.find((o) => o.id === r.id);
    if (!op || !estOperationStatut(op)) continue;
    if ((r.etat === "conflit" || r.etat === "erreur") && r.statutServeur) {
      courant = {
        ...courant,
        visites: courant.visites.map((v) =>
          v.id === op.visiteId ? { ...v, statut: r.statutServeur as StatutVisiteHL } : v
        ),
      };
    } else if (r.etat === "erreur") {
      // Refusée sans état serveur connu : on revient à ce que l'appareil connaissait.
      courant = {
        ...courant,
        visites: courant.visites.map((v) => (v.id === op.visiteId ? { ...v, statut: op.statutConnu } : v)),
      };
    }
  }
  return courant;
}
