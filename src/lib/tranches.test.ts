import { test } from "vitest";
import assert from "node:assert/strict";
import {
  TRANCHES,
  estTranche,
  etatTranche,
  passageDeTranche,
  trancheDeHeure,
  trancheParDefaut,
  tranchesDuPassage,
} from "./tranches";

test("passage dérivé de la tranche : matin < 12 h, midi 12-16 h, soir ≥ 16 h", () => {
  assert.deepEqual(TRANCHES.map(passageDeTranche), [
    "matin", "matin", "matin", "midi", "midi", "soir", "soir", "soir",
  ]);
});

test("tranche par défaut cohérente avec le passage (migration des visites existantes)", () => {
  assert.equal(trancheParDefaut("matin"), "8-10");
  assert.equal(trancheParDefaut("midi"), "12-14");
  assert.equal(trancheParDefaut("soir"), "18-20");
  for (const p of ["matin", "midi", "soir"] as const) {
    assert.equal(passageDeTranche(trancheParDefaut(p)), p);
  }
  assert.deepEqual(tranchesDuPassage("midi"), ["12-14", "14-16"]);
});

test("tranche de l'heure courante, bornes incluses à gauche", () => {
  assert.equal(trancheDeHeure(5), "6-8");
  assert.equal(trancheDeHeure(6), "6-8");
  assert.equal(trancheDeHeure(7), "6-8");
  assert.equal(trancheDeHeure(8), "8-10");
  assert.equal(trancheDeHeure(11), "10-12");
  assert.equal(trancheDeHeure(12), "12-14");
  assert.equal(trancheDeHeure(15), "14-16");
  assert.equal(trancheDeHeure(16), "16-18");
  assert.equal(trancheDeHeure(20), "20-21");
  assert.equal(trancheDeHeure(23), "20-21");
});

test("validation de tranche", () => {
  assert.equal(estTranche("8-10"), true);
  assert.equal(estTranche("9-11"), false);
  assert.equal(estTranche(undefined), false);
});

test("état visuel d'une tranche", () => {
  assert.equal(etatTranche("8-10", 0, 9), "terminee");
  assert.equal(etatTranche("8-10", 2, 9), "en_cours");
  assert.equal(etatTranche("8-10", 2, 8), "en_cours");
  assert.equal(etatTranche("8-10", 2, 10), "en_retard");
  assert.equal(etatTranche("12-14", 3, 9.5), "a_venir");
  assert.equal(etatTranche("12-14", 3, null), "a_venir");
  assert.equal(etatTranche("12-14", 0, null), "terminee");
});
