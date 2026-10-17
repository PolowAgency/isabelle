import { test } from "vitest";
import assert from "node:assert/strict";
import { joursDeLaSemaine, lundiDe, lundiDemande, ordreJours } from "./semaine";
import { posteDuJour } from "./postes";

test("lundi de la semaine, y compris dimanche et passage d'année", () => {
  assert.equal(lundiDe("2026-10-15"), "2026-10-12"); // jeudi
  assert.equal(lundiDe("2026-10-12"), "2026-10-12"); // lundi
  assert.equal(lundiDe("2026-10-18"), "2026-10-12"); // dimanche
  assert.equal(lundiDe("2027-01-01"), "2026-12-28"); // vendredi, semaine à cheval sur l'année
});

test("semaine à cheval sur le changement d'heure : 7 jours distincts", () => {
  assert.deepEqual(joursDeLaSemaine("2026-10-19"), [
    "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
  ]);
  assert.deepEqual(joursDeLaSemaine("2026-03-23"), [
    "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29",
  ]);
});

test("?semaine= : valide, absent, invalide", () => {
  assert.equal(lundiDemande("2026-10-21", "2026-10-15"), "2026-10-19");
  assert.equal(lundiDemande(undefined, "2026-10-15"), "2026-10-12");
  assert.equal(lundiDemande("n'importe quoi", "2026-10-15"), "2026-10-12");
  assert.equal(lundiDemande("2026-02-31", "2026-10-15"), "2026-10-12");
});

test("jeudi : le jeudi s'ouvre d'abord, puis vendredi… dimanche, puis lundi-mercredi déjà passés", () => {
  const jours = joursDeLaSemaine("2026-10-12");
  assert.deepEqual(ordreJours(jours, "2026-10-15"), [
    "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-12", "2026-10-13", "2026-10-14",
  ]);
});

test("autre semaine : ordre lundi -> dimanche inchangé", () => {
  const jours = joursDeLaSemaine("2026-10-19");
  assert.deepEqual(ordreJours(jours, "2026-10-15"), jours);
});

test("lundi : tous les jours déjà à venir, ordre inchangé", () => {
  const jours = joursDeLaSemaine("2026-10-12");
  assert.deepEqual(ordreJours(jours, "2026-10-12"), jours);
});

test("poste du jour déduit des tranches", () => {
  assert.equal(posteDuJour([]), null);
  assert.equal(posteDuJour(["6-8", "8-10"]), "matin");
  assert.equal(posteDuJour(["8-10", "12-14"]), "matin");
  assert.equal(posteDuJour(["18-20"]), "soir");
  assert.equal(posteDuJour(["14-16", "16-18"]), "soir");
  assert.equal(posteDuJour(["12-14"]), "midi");
  assert.equal(posteDuJour(["8-10", "18-20"]), "matin_soir");
  assert.equal(posteDuJour(["10-12", "20-21"]), "matin_soir");
});
