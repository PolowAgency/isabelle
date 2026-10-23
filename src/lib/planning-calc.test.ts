import { describe, expect, test } from "vitest";
import {
  agregerParTranche,
  dureeDeActes,
  dureeDeLaVisite,
  etatCharge,
  formaterDuree,
  fusionnerReglages,
  reglagesParDefaut,
} from "./planning-calc";

describe("durées des actes", () => {
  const { durees } = reglagesParDefaut();

  test("durée d'une visite = somme des durées de ses actes", () => {
    expect(dureeDeActes(["toilette", "injection"], durees)).toBe(40);
    expect(dureeDeActes([], durees)).toBeNull();
  });

  test("durée minimale d'une visite : 5 minutes, même si les actes réglés sont plus courts", () => {
    expect(dureeDeActes(["injection"], { injection: 2 })).toBe(5);
    expect(dureeDeActes(["injection", "pansement"], { injection: 2, pansement: 1 })).toBe(5);
    expect(dureeDeActes(["injection"], { injection: 10 })).toBe(10);
  });

  test("acte inconnu (saisie libre ancienne) : durée par défaut de 15 min", () => {
    expect(dureeDeActes(["soin-bizarre"], durees)).toBe(15);
  });

  test("les réglages de l'admin remplacent les valeurs par défaut, le reste est conservé", () => {
    const r = fusionnerReglages([{ acte: "toilette", dureeMin: 45 }], 90);
    expect(r.durees.toilette).toBe(45);
    expect(r.durees.injection).toBe(10);
    expect(r.capaciteTrancheMin).toBe(90);
    expect(fusionnerReglages([], null).capaciteTrancheMin).toBe(120);
  });

  test("durée saisie à la main prioritaire sur la somme des actes", () => {
    expect(dureeDeLaVisite({ actes: ["toilette"], dureeEstimeeMin: 50 }, durees)).toBe(50);
    expect(dureeDeLaVisite({ actes: ["toilette"], dureeEstimeeMin: null }, durees)).toBe(30);
    expect(dureeDeLaVisite({ actes: [], dureeEstimeeMin: null }, durees)).toBe(0);
  });
});

describe("charge d'une tranche", () => {
  test("seuils : vide, ok, proche à 80 %, dépassée au-delà de la capacité", () => {
    expect(etatCharge(0, 120)).toBe("vide");
    expect(etatCharge(60, 120)).toBe("ok");
    expect(etatCharge(96, 120)).toBe("proche");
    expect(etatCharge(120, 120)).toBe("proche");
    expect(etatCharge(121, 120)).toBe("depasse");
  });

  test("affichage de la durée", () => {
    expect(formaterDuree(45)).toBe("45 min");
    expect(formaterDuree(120)).toBe("2 h");
    expect(formaterDuree(135)).toBe("2 h 15");
    expect(formaterDuree(125)).toBe("2 h 05");
  });
});

describe("agrégats par tranche", () => {
  const { durees } = reglagesParDefaut();
  const v = (tranche: string, statut: string, actes: string[], dureeEstimeeMin: number | null = null) => ({
    tranche,
    statut,
    actes,
    dureeEstimeeMin,
  });

  test("nombre, durée, progression ; annulées et reportées ne comptent pas", () => {
    const [t68, t810] = agregerParTranche(
      [
        v("8-10", "prevue", ["toilette"]),
        v("8-10", "faite", ["injection"]),
        v("8-10", "absent", ["pansement"]),
        v("8-10", "annulee", ["perfusion"]),
        v("8-10", "reportee", ["perfusion"]),
        v("8-10", "prevue", ["autre"], 40),
      ],
      durees
    ).filter((a) => a.tranche === "6-8" || a.tranche === "8-10");
    expect(t68).toMatchObject({ nombre: 0, aFaire: 0, dureeMin: 0 });
    expect(t810).toMatchObject({ nombre: 4, aFaire: 2, faites: 1, dureeMin: 30 + 10 + 15 + 40, dureeRestanteMin: 30 + 40 });
  });

  test("toujours les 8 tranches, dans l'ordre de la journée", () => {
    expect(agregerParTranche([], durees).map((a) => a.tranche)).toEqual([
      "6-8", "8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-21",
    ]);
  });
});
