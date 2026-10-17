import { describe, expect, test } from "vitest";
import {
  ajouterJours,
  dateParisDe,
  estDateISOValide,
  formatDateComplete,
  formatDateLong,
  heureParis,
  inferPassage,
  inferTranche,
  joursDeLaSemaine,
  lundiDe,
  todayISO,
} from "./date";

// Le fuseau du processus de test est UTC (vitest.config.ts) : Paris doit
// quand même être respecté.

describe("aujourd'hui à Paris", () => {
  test("bascule de minuit : 22:30 UTC l'été = 00:30 le lendemain à Paris", () => {
    expect(todayISO(new Date("2026-07-14T21:59:00Z"))).toBe("2026-07-14");
    expect(todayISO(new Date("2026-07-14T22:00:00Z"))).toBe("2026-07-15");
    expect(todayISO(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });

  test("bascule de minuit en hiver (UTC+1)", () => {
    expect(todayISO(new Date("2026-01-14T22:59:00Z"))).toBe("2026-01-14");
    expect(todayISO(new Date("2026-01-14T23:00:00Z"))).toBe("2026-01-15");
  });

  test("changement d'heure de mars : 29 mars 2026, 02:00 -> 03:00", () => {
    expect(heureParis(new Date("2026-03-29T00:59:00Z"))).toBeCloseTo(1 + 59 / 60);
    expect(heureParis(new Date("2026-03-29T01:00:00Z"))).toBe(3); // saute de 1h59 à 3h00
    expect(todayISO(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
  });

  test("changement d'heure d'octobre : 25 octobre 2026, 03:00 -> 02:00", () => {
    expect(heureParis(new Date("2026-10-25T00:30:00Z"))).toBe(2.5); // 02:30 CEST
    expect(heureParis(new Date("2026-10-25T01:30:00Z"))).toBe(2.5); // 02:30 CET, la même heure locale revient
    expect(todayISO(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(todayISO(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(todayISO(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });

  test("lundi 00:30 Paris est déjà lundi, donc dans la semaine du lundi (pas la précédente)", () => {
    // Dimanche 18 oct. 2026 22:30 UTC = lundi 19 oct. 00:30 Paris
    const instant = new Date("2026-10-18T22:30:00Z");
    expect(todayISO(instant)).toBe("2026-10-19");
    expect(lundiDe(todayISO(instant))).toBe("2026-10-19");
    // Un calcul en fuseau UTC aurait donné la semaine précédente :
    expect(lundiDe(instant.toISOString().slice(0, 10))).toBe("2026-10-12");
  });

  test("passage et tranche courants à Paris", () => {
    expect(inferPassage(new Date("2026-07-14T07:30:00Z"))).toBe("matin"); // 09:30
    expect(inferPassage(new Date("2026-07-14T11:00:00Z"))).toBe("midi"); // 13:00
    expect(inferPassage(new Date("2026-07-14T16:00:00Z"))).toBe("soir"); // 18:00
    expect(inferTranche(new Date("2026-07-14T07:30:00Z"))).toBe("8-10");
    expect(inferTranche(new Date("2026-07-14T18:30:00Z"))).toBe("20-21"); // 20:30
  });

  test("instant -> jour à Paris", () => {
    expect(dateParisDe(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });
});

describe("jours calendaires", () => {
  test("validation de dates ISO réelles", () => {
    expect(estDateISOValide("2026-02-28")).toBe(true);
    expect(estDateISOValide("2028-02-29")).toBe(true);
    expect(estDateISOValide("2027-02-29")).toBe(false);
    expect(estDateISOValide("2026-02-31")).toBe(false);
    expect(estDateISOValide("2026-13-01")).toBe(false);
    expect(estDateISOValide("2026-2-1")).toBe(false);
    expect(estDateISOValide("")).toBe(false);
    expect(estDateISOValide(20260101)).toBe(false);
  });

  test("ajouter des jours à travers le changement d'heure", () => {
    expect(ajouterJours("2026-03-28", 1)).toBe("2026-03-29");
    expect(ajouterJours("2026-03-29", 1)).toBe("2026-03-30");
    expect(ajouterJours("2026-10-24", 1)).toBe("2026-10-25");
    expect(ajouterJours("2026-10-25", 1)).toBe("2026-10-26");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("semaine ISO", () => {
    expect(joursDeLaSemaine("2026-10-19")).toHaveLength(7);
    expect(lundiDe("2026-10-18")).toBe("2026-10-12");
  });

  test("affichage indépendant du fuseau", () => {
    expect(formatDateLong("2026-10-25")).toBe("dimanche 25 octobre");
    expect(formatDateLong("2026-03-29")).toBe("dimanche 29 mars");
    expect(formatDateComplete("2026-10-19")).toBe("lundi 19 octobre 2026");
  });
});
