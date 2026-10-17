import { describe, expect, test } from "vitest";
import { apercuRepartition, casesEnDepassement, proposerRepartition, type Collegue, type GroupePatient, type VisiteCharge } from "./repartition";
import { reglagesParDefaut } from "./planning-calc";

const { durees } = reglagesParDefaut();
const visite = (date: string, tranche: string, dureeEstimeeMin: number | null = null, actes: string[] = ["toilette"]): VisiteCharge => ({
  date,
  tranche,
  actes,
  dureeEstimeeMin,
});
const collegue = (id: string, visites: VisiteCharge[] = [], absente: string[] = []): Collegue => ({
  id,
  visites,
  joursAbsente: new Set(absente),
});
const groupe = (patientId: string, ...visites: VisiteCharge[]): GroupePatient => ({ patientId, visites });

describe("répartition des visites d'une absente", () => {
  test("cases en dépassement : même jour et même tranche additionnés", () => {
    const v = [visite("2026-11-02", "8-10", 70), visite("2026-11-02", "8-10", 60), visite("2026-11-02", "10-12", 100)];
    expect(casesEnDepassement(v, durees, 120)).toBe(1);
    expect(casesEnDepassement(v, durees, 200)).toBe(0);
  });

  test("aperçu : avant / après, dépassements et jours d'absence de la collègue", () => {
    const groupes = [groupe("p1", visite("2026-11-02", "8-10", 60), visite("2026-11-03", "8-10", 60))];
    const c = collegue("m", [visite("2026-11-02", "8-10", 90)], ["2026-11-03"]);
    const [a] = apercuRepartition(groupes, [c], { p1: "m" }, durees, 120);
    expect(a).toMatchObject({
      nbAvant: 1,
      nbApres: 3,
      minAvant: 90,
      minApres: 210,
      depassementsAvant: 0,
      depassementsApres: 1, // le 2 nov. 8-10 : 90 + 60 = 150 > 120
      surJoursAbsente: 1,
    });
  });

  test("patients non attribués : comptés chez personne", () => {
    const [a] = apercuRepartition([groupe("p1", visite("2026-11-02", "8-10", 60))], [collegue("m")], {}, durees, 120);
    expect(a.nbApres).toBe(0);
  });

  test("proposition équitable : le plus lourd d'abord, vers la collègue la moins chargée", () => {
    const groupes = [
      groupe("lourd", visite("2026-11-02", "8-10", 100)),
      groupe("moyen", visite("2026-11-02", "10-12", 60)),
      groupe("leger", visite("2026-11-02", "12-14", 30)),
    ];
    const p = proposerRepartition(groupes, [collegue("a"), collegue("b", [visite("2026-11-02", "16-18", 20)])], durees);
    expect(p).toEqual({ lourd: "a", moyen: "b", leger: "b" }); // a=100, b=20 -> moyen chez b (80) -> leger chez b (110)
  });

  test("une collègue absente un des jours n'est choisie que s'il n'y a personne d'autre", () => {
    const groupes = [groupe("p", visite("2026-11-02", "8-10", 60))];
    expect(proposerRepartition(groupes, [collegue("a", [], ["2026-11-02"]), collegue("b", [visite("2026-11-02", "8-10", 200)])], durees)).toEqual({ p: "b" });
    expect(proposerRepartition(groupes, [collegue("a", [], ["2026-11-02"])], durees)).toEqual({ p: "a" });
    expect(proposerRepartition(groupes, [], durees)).toEqual({});
  });
});
