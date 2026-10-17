import { describe, expect, test } from "vitest";
import { normaliserPrises, priseALerte, traitementsSansReponse } from "./prises-calc";

describe("prises de traitement", () => {
  const dus = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

  test("refusée ou non administrée = alerte ; administrée = non", () => {
    expect(priseALerte("administre")).toBe(false);
    expect(priseALerte("refuse")).toBe(true);
    expect(priseALerte("non_administre")).toBe(true);
  });

  test("traitements sans réponse : saisies et prises déjà enregistrées comptent", () => {
    expect(traitementsSansReponse(dus, [])).toEqual(["t1", "t2", "t3"]);
    expect(traitementsSansReponse(dus, [{ traitementId: "t1" }], [{ traitementId: "t3" }])).toEqual(["t2"]);
    expect(traitementsSansReponse([], [])).toEqual([]);
  });

  test("normalisation : traitements non prévus ignorés, dernière saisie gardée, commentaire borné et vidé si administré", () => {
    const longue = "x".repeat(500);
    const res = normaliserPrises(dus, [
      { traitementId: "t1", statut: "refuse", commentaire: "  a refusé  " },
      { traitementId: "t1", statut: "non_administre", commentaire: longue },
      { traitementId: "t2", statut: "administre", commentaire: "ignoré" },
      { traitementId: "inconnu", statut: "refuse", commentaire: null },
    ]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ traitementId: "t1", statut: "non_administre" });
    expect(res[0].commentaire).toHaveLength(300);
    expect(res[1]).toEqual({ traitementId: "t2", statut: "administre", commentaire: null });
  });
});
