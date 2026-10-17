import { superposerFile } from "./local";
import { synchroniser, type BilanSynchronisation } from "./file";
import { lireInstantane, listerFile, sauverInstantane } from "./stockage";
import type { InstantaneHL } from "./types";

// Orchestration côté navigateur : service worker, téléchargement de l'instantané, synchronisation.

export async function enregistrerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  // Jamais en développement : un service worker y servirait des fichiers périmés.
  if (process.env.NODE_ENV !== "production") return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** Demande au service worker de (re)mettre en cache la coquille hors-ligne et ses fichiers. */
export async function precacherCoquille(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  registration?.active?.postMessage({ type: "PRECACHE_COQUILLE" });
}

export type ResultatTelechargement =
  | { etat: "ok"; instantane: InstantaneHL }
  | { etat: "session" }
  | { etat: "reseau" };

/** Télécharge la tournée du jour et les fiches utiles, y superpose les actions en attente, stocke chiffré. */
export async function telechargerInstantane(soignanteId: string): Promise<ResultatTelechargement> {
  let reponse: Response;
  try {
    reponse = await fetch("/api/hors-ligne/snapshot", {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { etat: "reseau" };
  }
  if (reponse.type === "opaqueredirect" || reponse.status === 401) return { etat: "session" };
  if (!reponse.ok) return { etat: "reseau" };

  const recu = (await reponse.json()) as InstantaneHL;
  // Ne jamais stocker les données d'une autre soignante que celle de la session de cet appareil.
  if (recu.soignanteId !== soignanteId) return { etat: "session" };

  const instantane = superposerFile(recu, await listerFile(soignanteId));
  await sauverInstantane(instantane);
  return { etat: "ok", instantane };
}

/** Synchronise d'abord ce qui a été fait hors-ligne, puis recharge l'état du jour. */
export async function rafraichir(
  soignanteId: string
): Promise<{ bilan: BilanSynchronisation; telechargement: ResultatTelechargement }> {
  const bilan = await synchroniser(soignanteId);
  const telechargement = await telechargerInstantane(soignanteId);
  return { bilan, telechargement };
}

export function reseauIndisponible(erreur: unknown): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || erreur instanceof TypeError;
}

export { lireInstantane };
