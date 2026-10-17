import type { OperationHorsLigne, ResultatOperation, StatutVisiteHL } from "./types";

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

export function evaluerOperation(op: OperationHorsLigne, serveur: EtatServeur | null): Decision {
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
 * Compacte la file avant envoi : pour une même visite, seule la dernière
 * opération compte (marquer faite puis « à demain » pour corriger = une seule
 * opération), mais l'ordre d'origine des visites est conservé. Le statut « connu »
 * de l'opération gardée est celui de la PREMIÈRE : c'est le dernier état que le
 * serveur ait réellement vu, les opérations intermédiaires ne lui sont jamais parvenues.
 */
export function compacterFile(operations: OperationHorsLigne[]): OperationHorsLigne[] {
  const derniere = new Map<string, OperationHorsLigne>();
  const premierStatut = new Map<string, OperationHorsLigne["statutConnu"]>();
  for (const op of operations) {
    derniere.set(op.visiteId, op);
    if (!premierStatut.has(op.visiteId)) premierStatut.set(op.visiteId, op.statutConnu);
  }
  return operations
    .filter((op) => derniere.get(op.visiteId) === op)
    .map((op) => ({ ...op, statutConnu: premierStatut.get(op.visiteId)! }));
}
