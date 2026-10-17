import { describe, expect, test } from "vitest";
import {
  blocage,
  delaiSecondes,
  empreinte,
  ipDepuisEntetes,
  messageBlocage,
  type EtatTentatives,
} from "./login-guard";

const etat = (partiel: Partial<EtatTentatives>): EtatTentatives => ({
  echecsEmail: 0,
  echecsIp: 0,
  dernierEchecEmail: null,
  dernierEchecIp: null,
  ...partiel,
});

describe("délai croissant", () => {
  test("aucun délai avant 5 échecs", () => {
    for (let n = 0; n < 5; n++) expect(delaiSecondes(n, 5)).toBe(0);
  });
  test("30 s, 1 min, 2 min, 4 min, 8 min puis plafond 15 min", () => {
    expect([5, 6, 7, 8, 9, 10, 20].map((n) => delaiSecondes(n, 5))).toEqual([30, 60, 120, 240, 480, 900, 900]);
  });
});

describe("blocage", () => {
  const maintenant = new Date("2026-10-17T10:00:00Z");

  test("4 échecs : pas bloqué", () => {
    expect(blocage(etat({ echecsEmail: 4, dernierEchecEmail: maintenant }), maintenant).bloque).toBe(false);
  });

  test("5 échecs à l'instant : bloqué 30 s, déblocage automatique ensuite", () => {
    const e = etat({ echecsEmail: 5, dernierEchecEmail: maintenant });
    expect(blocage(e, maintenant)).toEqual({ bloque: true, secondes: 30 });
    expect(blocage(e, new Date(maintenant.getTime() + 20_000)).secondes).toBe(10);
    expect(blocage(e, new Date(maintenant.getTime() + 31_000)).bloque).toBe(false);
  });

  test("le seuil par adresse IP est plus haut", () => {
    expect(blocage(etat({ echecsIp: 10, dernierEchecIp: maintenant }), maintenant).bloque).toBe(false);
    expect(blocage(etat({ echecsIp: 20, dernierEchecIp: maintenant }), maintenant).bloque).toBe(true);
  });

  test("le plus long des deux délais s'applique", () => {
    const e = etat({ echecsEmail: 5, dernierEchecEmail: maintenant, echecsIp: 22, dernierEchecIp: maintenant });
    expect(blocage(e, maintenant).secondes).toBe(120);
  });

  test("message générique", () => {
    expect(messageBlocage(30)).toBe("Trop de tentatives. Réessayez dans 1 minute.");
    expect(messageBlocage(150)).toBe("Trop de tentatives. Réessayez dans 3 minutes.");
  });
});

describe("empreintes", () => {
  test("stables, insensibles à la casse, dépendantes du secret, sans valeur en clair", () => {
    const a = empreinte("Isabelle@Cabinet.fr", "secret");
    expect(a).toBe(empreinte(" isabelle@cabinet.fr ", "secret"));
    expect(a).not.toBe(empreinte("isabelle@cabinet.fr", "autre"));
    expect(a).not.toContain("isabelle");
    expect(a).toHaveLength(64);
  });

  test("adresse IP depuis X-Forwarded-For", () => {
    const entetes = (v: string | null) => ({ get: () => v });
    expect(ipDepuisEntetes(entetes("203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
    expect(ipDepuisEntetes(entetes(null))).toBeNull();
    expect(ipDepuisEntetes(entetes(""))).toBeNull();
  });
});
