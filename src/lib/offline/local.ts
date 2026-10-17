import type { InstantaneHL, OperationHorsLigne, ResultatOperation, StatutVisiteHL } from "./types";

// Application locale des opérations sur l'instantané affiché (fonctions pures) :
// la tournée hors-ligne reflète immédiatement ce que l'on vient de faire, et
// retrouve l'état du serveur dès qu'un conflit est signalé.

function statutCible(op: OperationHorsLigne): StatutVisiteHL {
  return op.type === "decaler" ? "reportee" : op.statut;
}

export function appliquerOperation(instantane: InstantaneHL, op: OperationHorsLigne): InstantaneHL {
  return {
    ...instantane,
    visites: instantane.visites.map((v) =>
      v.id === op.visiteId
        ? {
            ...v,
            statut: statutCible(op),
            actes: op.type === "marquer" && op.actes ? op.actes : v.actes,
            heureReelle: op.type === "marquer" && op.statut === "faite" ? new Date(op.creeLe).toISOString() : null,
          }
        : v
    ),
  };
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
    if (!op) continue;
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
