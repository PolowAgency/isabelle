import { estOperationStatut, type OperationHorsLigne, type OperationStatut, type ResultatOperation, type StatutVisiteHL } from "./types";

// Règles de rejeu d'une opération faite hors-ligne. Principe : une action faite
// sans réseau ne remplace JAMAIS silencieusement ce qu'une collègue a enregistré
// entre-temps. Si l'état du serveur n'est plus celui que l'appareil connaissait,
// rien n'est modifié et le conflit est signalé, avec l'état actuel du serveur.

export type EtatServeur = {
  statut: StatutVisiteHL;
  /** Prénom de la dernière personne ayant changé le statut, si connu. */
  parPrenom: string | null;
  quand: string | null;
};

export type Decision =
  | { action: "appliquer" }
  | { action: "deja_fait" }
  | { action: "conflit"; message: string };

const LIBELLES: Record<StatutVisiteHL, string> = {
  prevue: "prévue",
  faite: "déjà validée",
  absent: "marquée absente",
  reportee: "déjà reportée",
  annulee: "annulée",
};

export function evaluerOperation(op: OperationStatut, serveur: EtatServeur | null): Decision {
  if (!serveur) return { action: "conflit", message: "Visite introuvable." };
  if (serveur.statut === "annulee") {
    return { action: "conflit", message: "Cette visite a été annulée entre-temps." };
  }

  const cible: StatutVisiteHL = op.type === "decaler" ? "reportee" : op.statut;

  // Déjà dans l'état voulu (opération déjà envoyée, ou collègue arrivée au même résultat) : rien à refaire.
  if (serveur.statut === cible) return { action: "deja_fait" };

  // L'état n'a pas bougé depuis ce que l'appareil connaissait : on applique.
  if (serveur.statut === op.statutConnu) return { action: "appliquer" };

  const qui = serveur.parPrenom ? ` par ${serveur.parPrenom}` : "";
  return {
    action: "conflit",
    message: `Cette visite est ${LIBELLES[serveur.statut]}${serveur.statut === "prevue" ? "" : qui} : votre action hors-ligne n'a pas été appliquée.`,
  };
}

/** Traduit une décision en résultat pour le client. */
export function versResultat(op: OperationHorsLigne, serveur: EtatServeur | null, decision: Decision): ResultatOperation {
  if (decision.action === "appliquer") return { id: op.id, etat: "applique" };
  if (decision.action === "deja_fait") {
    return { id: op.id, etat: "deja_fait", statutServeur: serveur?.statut };
  }
  return {
    id: op.id,
    etat: "conflit",
    message: decision.message,
    statutServeur: serveur?.statut,
    parPrenom: serveur?.parPrenom ?? null,
    quand: serveur?.quand ?? null,
  };
}

/**
 * Compacte la file avant envoi, visite par visite :
 *  - changements de statut : seule la dernière opération compte (marquer faite puis « à demain »
 *    pour corriger = une seule opération). Le statut « connu » de l'opération gardée est celui de
 *    la PREMIÈRE : c'est le dernier état que le serveur ait réellement vu ;
 *  - arrivée : la première est gardée (la première arrivée fait foi) ;
 *  - déplacements : tous gardés, dans l'ordre (chacun s'applique au résultat du précédent).
 * L'ordre d'origine des opérations est conservé.
 */
export function compacterFile(operations: OperationHorsLigne[]): OperationHorsLigne[] {
  const derniereStatut = new Map<string, OperationStatut>();
  const premierStatut = new Map<string, OperationStatut["statutConnu"]>();
  const premiereArrivee = new Set<string>();
  const arriveeGardee = new Map<string, string>();
  for (const op of operations) {
    if (estOperationStatut(op)) {
      derniereStatut.set(op.visiteId, op);
      if (!premierStatut.has(op.visiteId)) premierStatut.set(op.visiteId, op.statutConnu);
    } else if (op.type === "arrivee" && !premiereArrivee.has(op.visiteId)) {
      premiereArrivee.add(op.visiteId);
      arriveeGardee.set(op.visiteId, op.id);
    }
  }
  const gardees: OperationHorsLigne[] = [];
  for (const op of operations) {
    if (estOperationStatut(op)) {
      if (derniereStatut.get(op.visiteId) === op) gardees.push({ ...op, statutConnu: premierStatut.get(op.visiteId)! });
    } else if (op.type === "arrivee") {
      if (arriveeGardee.get(op.visiteId) === op.id) gardees.push(op);
    } else {
      gardees.push(op);
    }
  }
  return gardees;
}
