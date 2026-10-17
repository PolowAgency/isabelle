import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ajouterMois,
  dateFinDepuisDuree,
  genererDatesSerie,
  jourSemaineISO,
  MAX_JOURS_SERIE,
} from "./recurrence";

test("quotidien pendant 1 mois à partir du 1er sept. = 30 visites", () => {
  const fin = dateFinDepuisDuree("2026-09-01", "mois", 1);
  assert.equal(fin, "2026-09-30");
  const dates = genererDatesSerie({ dateDebut: "2026-09-01", dateFin: fin, frequence: "quotidien" });
  assert.equal(dates.length, 30);
  assert.equal(dates[0], "2026-09-01");
  assert.equal(dates[29], "2026-09-30");
});

test("fin de mois : 31 janv. + 1 mois ramène au dernier jour de février", () => {
  assert.equal(ajouterMois("2026-01-31", 1), "2026-02-28");
  assert.equal(ajouterMois("2026-03-31", 1), "2026-04-30");
  assert.equal(ajouterMois("2026-11-30", 3), "2027-02-28");
  assert.equal(ajouterMois("2026-12-15", 1), "2027-01-15");
  assert.equal(dateFinDepuisDuree("2026-01-31", "mois", 1), "2026-02-27");
});

test("année bissextile : 29 février présent en 2028, absent en 2027", () => {
  assert.equal(ajouterMois("2028-01-31", 1), "2028-02-29");
  const dates2028 = genererDatesSerie({ dateDebut: "2028-02-27", dateFin: "2028-03-02", frequence: "quotidien" });
  assert.deepEqual(dates2028, ["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  const dates2027 = genererDatesSerie({ dateDebut: "2027-02-27", dateFin: "2027-03-02", frequence: "quotidien" });
  assert.deepEqual(dates2027, ["2027-02-27", "2027-02-28", "2027-03-01", "2027-03-02"]);
  assert.equal(dateFinDepuisDuree("2028-02-01", "mois", 1), "2028-02-29");
  assert.equal(dateFinDepuisDuree("2027-02-01", "mois", 1), "2027-02-28");
});

test("changement d'heure (Paris) : aucun jour sauté ni dupliqué", () => {
  // Passage à l'heure d'été le 29 mars 2026, retour à l'heure d'hiver le 25 octobre 2026.
  const ete = genererDatesSerie({ dateDebut: "2026-03-27", dateFin: "2026-03-31", frequence: "quotidien" });
  assert.deepEqual(ete, ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  const hiver = genererDatesSerie({ dateDebut: "2026-10-23", dateFin: "2026-10-27", frequence: "quotidien" });
  assert.deepEqual(hiver, ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);

  const toutLAn = genererDatesSerie({ dateDebut: "2026-01-01", dateFin: "2026-12-31", frequence: "quotidien" });
  assert.equal(toutLAn.length, 365);
  assert.equal(new Set(toutLAn).size, 365);
});

test("changement d'heure : un jour sur deux reste régulier (pas de décalage de 23/25 h)", () => {
  const dates = genererDatesSerie({ dateDebut: "2026-03-25", dateFin: "2026-04-04", frequence: "un_jour_sur_deux" });
  assert.deepEqual(dates, ["2026-03-25", "2026-03-27", "2026-03-29", "2026-03-31", "2026-04-02", "2026-04-04"]);
});

test("un jour sur deux : démarre au jour de début, saute à travers fin de mois", () => {
  const dates = genererDatesSerie({ dateDebut: "2026-01-30", dateFin: "2026-02-06", frequence: "un_jour_sur_deux" });
  assert.deepEqual(dates, ["2026-01-30", "2026-02-01", "2026-02-03", "2026-02-05"]);
});

test("une semaine sur deux : même jour que le début, toutes les 2 semaines", () => {
  // 7 oct. 2026 = mercredi
  assert.equal(jourSemaineISO("2026-10-07"), 3);
  const dates = genererDatesSerie({ dateDebut: "2026-10-07", dateFin: "2026-11-30", frequence: "une_semaine_sur_deux" });
  assert.deepEqual(dates, ["2026-10-07", "2026-10-21", "2026-11-04", "2026-11-18"]);
});

test("une semaine sur deux avec jours choisis : semaine de début incluse, jours antérieurs au début exclus", () => {
  // Début jeudi 8 oct. 2026 : lundi 5 (avant le début) est ignoré, semaines 1 et 3 retenues.
  const dates = genererDatesSerie({
    dateDebut: "2026-10-08",
    dateFin: "2026-10-31",
    frequence: "une_semaine_sur_deux",
    joursSemaine: [1, 4],
  });
  assert.deepEqual(dates, ["2026-10-08", "2026-10-19", "2026-10-22"]);
});

test("jours de la semaine : lundi, mercredi, vendredi", () => {
  const dates = genererDatesSerie({
    dateDebut: "2026-10-12",
    dateFin: "2026-10-25",
    frequence: "jours_semaine",
    joursSemaine: [5, 1, 3, 3],
  });
  assert.deepEqual(dates, ["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]);
});

test("durées en jours / semaines", () => {
  assert.equal(dateFinDepuisDuree("2026-10-01", "jours", 1), "2026-10-01");
  assert.equal(dateFinDepuisDuree("2026-10-01", "jours", 30), "2026-10-30");
  assert.equal(dateFinDepuisDuree("2026-10-01", "semaines", 2), "2026-10-14");
});

test("entrées invalides refusées", () => {
  assert.throws(() => genererDatesSerie({ dateDebut: "2026-10-10", dateFin: "2026-10-09", frequence: "quotidien" }), RangeError);
  assert.throws(() => genererDatesSerie({ dateDebut: "2026-02-30", dateFin: "2026-03-05", frequence: "quotidien" }), RangeError);
  assert.throws(() => genererDatesSerie({ dateDebut: "pas-une-date", dateFin: "2026-03-05", frequence: "quotidien" }), RangeError);
  assert.throws(() => genererDatesSerie({ dateDebut: "2026-10-01", dateFin: "2026-10-31", frequence: "jours_semaine" }), RangeError);
  assert.throws(
    () => genererDatesSerie({ dateDebut: "2026-10-01", dateFin: "2026-10-31", frequence: "jours_semaine", joursSemaine: [0] }),
    RangeError
  );
  assert.throws(() => dateFinDepuisDuree("2026-10-01", "jours", 0), RangeError);
  assert.throws(
    () => genererDatesSerie({ dateDebut: "2026-01-01", dateFin: "2027-01-02", frequence: "quotidien" }),
    RangeError
  );
  assert.equal(
    genererDatesSerie({ dateDebut: "2026-01-01", dateFin: "2026-12-31", frequence: "quotidien" }).length <= MAX_JOURS_SERIE,
    true
  );
});
