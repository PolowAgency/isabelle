import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { appliquerOperation, reconcilier, superposerFile } from "./local";
import {
  compterFile,
  enfiler,
  lireInstantane,
  listerFile,
  purgerDonneesLocales,
  purgerInstantane,
  retirerPourVisites,
  sauverInstantane,
} from "./stockage";
import type { InstantaneHL, OperationHorsLigne } from "./types";

const instantane = (surcharge: Partial<InstantaneHL> = {}): InstantaneHL => ({
  soignanteId: "soignante-1",
  jour: "2026-10-17",
  genereLe: Date.now(),
  visites: [
    {
      id: "v1", patientId: "p1", patientPrenom: "Jeanne", patientNom: "SECRET-NOM", adresse: "1 rue X", ville: "Pau",
      secteurNom: "Centre", tranche: "8-10", actes: ["pansement"], statut: "prevue", heureReelle: null, serieId: null,
    },
    {
      id: "v2", patientId: "p2", patientPrenom: "Paul", patientNom: "Durand", adresse: null, ville: null,
      secteurNom: "Centre", tranche: "10-12", actes: [], statut: "prevue", heureReelle: null, serieId: null,
    },
  ],
  fiches: {
    p1: {
      patientId: "p1", prenom: "Jeanne", nom: "SECRET-NOM", telephone: null, adresse: null, complementAdresse: null,
      codePostal: null, ville: null, medecinTraitantNom: null, medecinTraitantTelephone: null,
      contactUrgenceNom: null, contactUrgenceTelephone: null, contactUrgenceLien: null,
      acces: {
        codePortail: "CODE-PORTAIL-4598", codeImmeuble: null, etage: null, digicodePorte: null, emplacementCle: null,
        presenceAnimal: false, descriptionAnimal: null, detailsAidant: null, stationnement: null, notesAcces: null,
      },
      traitements: [], transmissions: [], prochaines: [],
    },
  },
  ...surcharge,
});

const op = (id: string, visiteId: string, creeLe: number): OperationHorsLigne => ({
  id, type: "marquer", visiteId, statut: "faite", actes: ["injection"], statutConnu: "prevue", creeLe,
});

// Contenu brut d'IndexedDB (pour vérifier qu'aucune donnée n'y est en clair).
async function contenuBrut(): Promise<string> {
  const db: IDBDatabase = await new Promise((resolve, reject) => {
    const r = indexedDB.open("isabelle-offline");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const morceaux: string[] = [];
  for (const nom of ["instantane", "file"]) {
    const valeurs: unknown[] = await new Promise((resolve) => {
      const q = db.transaction(nom).objectStore(nom).getAll();
      q.onsuccess = () => resolve(q.result);
    });
    for (const v of valeurs) {
      const o = v as Record<string, unknown>;
      morceaux.push(JSON.stringify({ ...o, iv: undefined }), Buffer.from(o.data as ArrayBuffer).toString("latin1"));
    }
  }
  db.close();
  return morceaux.join("|");
}

beforeEach(() => {
  // Base vierge à chaque test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe("instantané chiffré", () => {
  test("aller-retour ; aucune donnée patient en clair dans IndexedDB", async () => {
    await sauverInstantane(instantane());
    const relu = await lireInstantane("soignante-1");
    expect(relu?.visites).toHaveLength(2);
    expect(relu?.fiches.p1.acces.codePortail).toBe("CODE-PORTAIL-4598");

    const brut = await contenuBrut();
    expect(brut).not.toContain("SECRET-NOM");
    expect(brut).not.toContain("CODE-PORTAIL-4598");
    expect(brut).not.toContain("Jeanne");
  });

  test("instantané d'une autre soignante : jamais restitué, et purgé", async () => {
    await sauverInstantane(instantane());
    expect(await lireInstantane("soignante-2")).toBeNull();
    expect(await lireInstantane("soignante-1")).toBeNull();
  });

  test("instantané de plus de 24 h : purgé", async () => {
    const vieux = instantane({ genereLe: Date.now() - 25 * 3600 * 1000 });
    await sauverInstantane(vieux);
    expect(await lireInstantane("soignante-1")).toBeNull();
  });

  test("purge à la déconnexion : les données patient disparaissent, les actions non envoyées restent", async () => {
    await sauverInstantane(instantane());
    await enfiler("soignante-1", op("o1", "v1", 1));
    await purgerDonneesLocales();
    expect(await lireInstantane("soignante-1")).toBeNull();
    expect(await compterFile("soignante-1")).toBe(1);
    // La clé est conservée tant que la file est non vide : l'action reste déchiffrable.
    expect((await listerFile("soignante-1"))[0].visiteId).toBe("v1");
  });

  test("tout est effacé (clé comprise) quand plus rien n'est en attente", async () => {
    await sauverInstantane(instantane());
    await enfiler("soignante-1", op("o1", "v1", 1));
    await purgerDonneesLocales();
    await retirerPourVisites("soignante-1", ["v1"]);
    expect(await compterFile()).toBe(0);
    const meta: unknown[] = await new Promise((resolve) => {
      const r = indexedDB.open("isabelle-offline");
      r.onsuccess = () => {
        const q = r.result.transaction("meta").objectStore("meta").getAllKeys();
        q.onsuccess = () => resolve(q.result);
      };
    });
    expect(meta).toEqual([]);
  });

  test("purge de l'instantané seul", async () => {
    await sauverInstantane(instantane());
    await purgerInstantane();
    expect(await lireInstantane()).toBeNull();
  });
});

describe("file d'opérations", () => {
  test("chiffrée, ordonnée, séparée par soignante", async () => {
    await enfiler("soignante-1", op("o2", "v2", 20));
    await enfiler("soignante-1", op("o1", "v1", 10));
    await enfiler("soignante-2", op("o3", "v9", 5));
    expect((await listerFile("soignante-1")).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(await compterFile("soignante-2")).toBe(1);
    expect(await contenuBrut()).not.toContain("injection");
  });

  test("retrait par visite : toutes les opérations compactées de la visite partent", async () => {
    await enfiler("soignante-1", op("a", "v1", 1));
    await enfiler("soignante-1", op("b", "v1", 2));
    await enfiler("soignante-1", op("c", "v2", 3));
    await retirerPourVisites("soignante-1", ["v1"]);
    expect((await listerFile("soignante-1")).map((o) => o.id)).toEqual(["c"]);
  });
});

describe("affichage local", () => {
  test("l'action faite hors-ligne apparaît tout de suite, avec les actes choisis", () => {
    const apres = appliquerOperation(instantane(), op("o1", "v2", 1_700_000_000_000));
    const v2 = apres.visites.find((v) => v.id === "v2")!;
    expect(v2.statut).toBe("faite");
    expect(v2.actes).toEqual(["injection"]);
    expect(v2.heureReelle).not.toBeNull();
    expect(apres.visites.find((v) => v.id === "v1")!.statut).toBe("prevue");
  });

  test("superposer la file sur un instantané tout neuf du serveur", () => {
    const neuf = instantane();
    const avecFile = superposerFile(neuf, [op("o1", "v1", 1)]);
    expect(avecFile.visites.find((v) => v.id === "v1")!.statut).toBe("faite");
  });

  test("conflit : l'état du serveur remplace l'état local", () => {
    const local = appliquerOperation(instantane(), op("o1", "v1", 1));
    const reconcilie = reconcilier(local, [op("o1", "v1", 1)], [
      { id: "o1", etat: "conflit", statutServeur: "absent", parPrenom: "Magalie", message: "…" },
    ]);
    expect(reconcilie.visites.find((v) => v.id === "v1")!.statut).toBe("absent");
  });

  test("opération confirmée : l'état local est conservé", () => {
    const local = appliquerOperation(instantane(), op("o1", "v1", 1));
    const reconcilie = reconcilier(local, [op("o1", "v1", 1)], [{ id: "o1", etat: "applique" }]);
    expect(reconcilie.visites.find((v) => v.id === "v1")!.statut).toBe("faite");
  });
});
