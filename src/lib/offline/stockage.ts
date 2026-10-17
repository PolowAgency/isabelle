import { DUREE_VIE_INSTANTANE_MS, type InstantaneHL, type OperationHorsLigne } from "./types";

// Stockage local du mode hors-ligne : IndexedDB + chiffrement WebCrypto.
//
// - L'instantané (données patient) et les opérations en attente sont chiffrés en
//   AES-GCM avec une clé NON EXTRACTIBLE (CryptoKey conservée dans IndexedDB) : le
//   contenu n'est pas lisible en clair dans le stockage du navigateur. Limite assumée :
//   quelqu'un qui contrôle l'appareil déverrouillé et le navigateur peut faire déchiffrer
//   par l'appli ; la protection de l'appareil (code, chiffrement du téléphone) reste
//   indispensable.
// - L'instantané est purgé à la déconnexion, à l'expiration (24 h) et à la désactivation
//   du mode. Les opérations non envoyées sont CONSERVÉES (sinon une validation de soin
//   serait perdue) tant qu'elles n'ont pas été synchronisées, et rattachées à la
//   soignante qui les a faites.

const NOM_BASE = "isabelle-offline";
const VERSION_BASE = 1;
export const CLE_CONSENTEMENT = "isabelle-hors-ligne";

type Enveloppe = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM_BASE, VERSION_BASE);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("instantane")) db.createObjectStore("instantane");
      if (!db.objectStoreNames.contains("file")) db.createObjectStore("file", { keyPath: "id" });
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
}

async function transaction<T>(
  magasins: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | Promise<T> | void
): Promise<T> {
  const db = await ouvrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(magasins, mode);
      let valeur: T | undefined;
      const retour = fn(tx);
      if (retour && "onsuccess" in retour) {
        (retour as IDBRequest<T>).onsuccess = () => {
          valeur = (retour as IDBRequest<T>).result;
        };
      } else if (retour instanceof Promise) {
        retour.then((v) => (valeur = v), reject);
      }
      tx.oncomplete = () => resolve(valeur as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const lire = <T>(magasin: string, cle: IDBValidKey) =>
  transaction<T | undefined>([magasin], "readonly", (tx) => tx.objectStore(magasin).get(cle));
const ecrire = (magasin: string, valeur: unknown, cle?: IDBValidKey) =>
  transaction<IDBValidKey>([magasin], "readwrite", (tx) => tx.objectStore(magasin).put(valeur, cle));
const supprimer = (magasin: string, cle: IDBValidKey) =>
  transaction<undefined>([magasin], "readwrite", (tx) => tx.objectStore(magasin).delete(cle));
const lireTout = <T>(magasin: string) =>
  transaction<T[]>([magasin], "readonly", (tx) => tx.objectStore(magasin).getAll());
const vider = (magasin: string) =>
  transaction<undefined>([magasin], "readwrite", (tx) => tx.objectStore(magasin).clear());

// --- Chiffrement -------------------------------------------------------------

async function cle(): Promise<CryptoKey> {
  const existante = await lire<CryptoKey>("meta", "cle");
  if (existante) return existante;
  const nouvelle = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await ecrire("meta", nouvelle, "cle");
  return nouvelle;
}

async function chiffrerJson(valeur: unknown): Promise<Enveloppe> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const clair = new TextEncoder().encode(JSON.stringify(valeur));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cle(), clair);
  return { iv, data };
}

async function dechiffrerJson<T>(enveloppe: Enveloppe): Promise<T> {
  const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: enveloppe.iv }, await cle(), enveloppe.data);
  return JSON.parse(new TextDecoder().decode(clair)) as T;
}

// --- Instantané ---------------------------------------------------------------

type InstantaneStocke = Enveloppe & { soignanteId: string; genereLe: number };

export async function sauverInstantane(instantane: InstantaneHL): Promise<void> {
  const enveloppe = await chiffrerJson(instantane);
  await ecrire(
    "instantane",
    { ...enveloppe, soignanteId: instantane.soignanteId, genereLe: instantane.genereLe } satisfies InstantaneStocke,
    "courant"
  );
}

/** Instantané lisible de la soignante donnée ; périmé ou illisible = purgé et renvoyé null. */
export async function lireInstantane(soignanteId?: string, maintenant = Date.now()): Promise<InstantaneHL | null> {
  const stocke = await lire<InstantaneStocke>("instantane", "courant");
  if (!stocke) return null;
  if (soignanteId && stocke.soignanteId !== soignanteId) {
    await purgerInstantane();
    return null;
  }
  if (maintenant - stocke.genereLe > DUREE_VIE_INSTANTANE_MS) {
    await purgerInstantane();
    return null;
  }
  try {
    return await dechiffrerJson<InstantaneHL>(stocke);
  } catch {
    await purgerInstantane();
    return null;
  }
}

export async function purgerInstantane(): Promise<void> {
  await supprimer("instantane", "courant");
  await supprimerCleSiInutile();
}

// --- File d'opérations -----------------------------------------------------------

type OperationStockee = Enveloppe & { id: string; soignanteId: string; creeLe: number; visiteId: string };

export async function enfiler(soignanteId: string, operation: OperationHorsLigne): Promise<void> {
  const enveloppe = await chiffrerJson(operation);
  await ecrire("file", {
    ...enveloppe,
    id: operation.id,
    soignanteId,
    creeLe: operation.creeLe,
    visiteId: operation.visiteId,
  } satisfies OperationStockee);
}

/** Opérations en attente d'une soignante, dans l'ordre où elles ont été faites. */
export async function listerFile(soignanteId: string): Promise<OperationHorsLigne[]> {
  const brutes = (await lireTout<OperationStockee>("file"))
    .filter((o) => o.soignanteId === soignanteId)
    .sort((a, b) => a.creeLe - b.creeLe);
  const operations: OperationHorsLigne[] = [];
  for (const brute of brutes) {
    try {
      operations.push(await dechiffrerJson<OperationHorsLigne>(brute));
    } catch {
      // Opération illisible (clé perdue) : écartée plutôt que de bloquer toute la file.
      await supprimer("file", brute.id);
    }
  }
  return operations;
}

export async function compterFile(soignanteId?: string): Promise<number> {
  const toutes = await lireTout<OperationStockee>("file");
  return soignanteId ? toutes.filter((o) => o.soignanteId === soignanteId).length : toutes.length;
}

/** Retire une opération et toutes celles de la même visite (compactées côté serveur). */
export async function retirerPourVisites(soignanteId: string, visiteIds: string[]): Promise<void> {
  const toutes = await lireTout<OperationStockee>("file");
  for (const o of toutes) {
    if (o.soignanteId === soignanteId && visiteIds.includes(o.visiteId)) await supprimer("file", o.id);
  }
  await supprimerCleSiInutile();
}

/** Retire exactement ces opérations (celles qui viennent d'être envoyées) : une action faite pendant l'envoi reste en file. */
export async function retirerOperations(soignanteId: string, operationIds: string[]): Promise<void> {
  const ids = new Set(operationIds);
  const toutes = await lireTout<OperationStockee>("file");
  for (const o of toutes) {
    if (o.soignanteId === soignanteId && ids.has(o.id)) await supprimer("file", o.id);
  }
  await supprimerCleSiInutile();
}

// --- Purge ---------------------------------------------------------------------

async function supprimerCleSiInutile(): Promise<void> {
  const [instantane, file] = await Promise.all([lire("instantane", "courant"), lireTout("file")]);
  if (!instantane && file.length === 0) await supprimer("meta", "cle");
}

/**
 * Efface les données patient de l'appareil (déconnexion, désactivation du mode).
 * Les opérations non synchronisées sont gardées (`conserverFile`, par défaut) : les
 * supprimer ferait perdre des validations de soins.
 */
export async function purgerDonneesLocales(options: { conserverFile?: boolean } = {}): Promise<void> {
  await supprimer("instantane", "courant");
  if (options.conserverFile === false) await vider("file");
  await supprimerCleSiInutile();
}

// --- Consentement -------------------------------------------------------------------

export function horsLigneActive(): boolean {
  try {
    return localStorage.getItem(CLE_CONSENTEMENT) === "1";
  } catch {
    return false;
  }
}

export function definirHorsLigne(actif: boolean): void {
  try {
    if (actif) localStorage.setItem(CLE_CONSENTEMENT, "1");
    else localStorage.removeItem(CLE_CONSENTEMENT);
  } catch {
    // stockage indisponible : le mode reste désactivé
  }
}
