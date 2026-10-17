import { compacterFile } from "./regles";
import { reconcilier } from "./local";
import { enfiler, lireInstantane, listerFile, retirerPourVisites, sauverInstantane } from "./stockage";
import type { OperationHorsLigne, ResultatOperation, StatutVisiteHL } from "./types";

// Synchronisation de la file d'opérations avec le serveur (côté navigateur).

export type BilanSynchronisation =
  | { etat: "rien" }
  | { etat: "session"; enAttente: number } // session expirée : la file est conservée, reconnexion nécessaire
  | { etat: "reseau"; enAttente: number }
  | { etat: "ok"; envoyees: number; resultats: ResultatOperation[]; conflits: ResultatOperation[] };

export const EVENEMENT_FILE = "isabelle-file-changee";

function notifier() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENEMENT_FILE));
}

export function nouvelleOperation(
  base: { visiteId: string; statutConnu: StatutVisiteHL },
  action: { type: "marquer"; statut: "faite" | "absent"; actes?: string[] } | { type: "decaler" }
): OperationHorsLigne {
  const commun = { id: crypto.randomUUID(), visiteId: base.visiteId, statutConnu: base.statutConnu, creeLe: Date.now() };
  return action.type === "decaler"
    ? { ...commun, type: "decaler" }
    : { ...commun, type: "marquer", statut: action.statut, actes: action.actes };
}

export async function mettreEnFile(soignanteId: string, op: OperationHorsLigne): Promise<void> {
  await enfiler(soignanteId, op);
  notifier();
}

let enCours: Promise<BilanSynchronisation> | null = null;

/** Envoie la file au serveur. Une seule synchronisation à la fois ; jamais de perte en cas d'échec. */
export function synchroniser(soignanteId: string, urlSync = "/api/hors-ligne/sync"): Promise<BilanSynchronisation> {
  enCours ??= executer(soignanteId, urlSync).finally(() => {
    enCours = null;
    notifier();
  });
  return enCours;
}

async function executer(soignanteId: string, urlSync: string): Promise<BilanSynchronisation> {
  const operations = compacterFile(await listerFile(soignanteId));
  if (operations.length === 0) return { etat: "rien" };

  let reponse: Response;
  try {
    reponse = await fetch(urlSync, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operations }),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { etat: "reseau", enAttente: operations.length };
  }

  // Session expirée : redirection vers la connexion ou 401. La file reste intacte.
  if (reponse.type === "opaqueredirect" || reponse.status === 401 || reponse.status === 0) {
    return { etat: "session", enAttente: operations.length };
  }
  if (!reponse.ok) return { etat: "reseau", enAttente: operations.length };

  const { resultats } = (await reponse.json()) as { resultats: ResultatOperation[] };

  // Les opérations traitées (appliquées, déjà faites, en conflit ou refusées) sortent de la file :
  // un conflit n'est pas rejoué, il est montré à la soignante avec l'état du serveur.
  const visites = operations.filter((o) => resultats.some((r) => r.id === o.id)).map((o) => o.visiteId);
  await retirerPourVisites(soignanteId, visites);

  const instantane = await lireInstantane(soignanteId);
  if (instantane) await sauverInstantane(reconcilier(instantane, operations, resultats));

  return {
    etat: "ok",
    envoyees: resultats.length,
    resultats,
    conflits: resultats.filter((r) => r.etat === "conflit" || r.etat === "erreur"),
  };
}
