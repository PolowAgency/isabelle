import { describe, expect, test } from "vitest";
import { compacterFile, evaluerOperation, versResultat, type EtatServeur } from "./regles";
import type { OperationHorsLigne, OperationStatut } from "./types";

const serveur = (statut: EtatServeur["statut"], parPrenom: string | null = null): EtatServeur => ({
  statut,
  parPrenom,
  quand: "2026-10-17T09:30:00.000Z",
});
const marquer = (statut: "faite" | "absent", statutConnu: "prevue" | "faite" = "prevue"): OperationStatut => ({
  id: "op1",
  type: "marquer",
  visiteId: "v1",
  statut,
  statutConnu,
  creeLe: 1,
});
const decaler: OperationStatut = { id: "op2", type: "decaler", visiteId: "v1", statutConnu: "prevue", creeLe: 2 };

describe("rejeu d'une validation faite hors-ligne", () => {
  test("état inchangé sur le serveur : appliquée", () => {
    expect(evaluerOperation(marquer("faite"), serveur("prevue"))).toEqual({ action: "appliquer" });
  });

  test("une collègue a déjà validé : pas d'écrasement, déjà fait (idempotent)", () => {
    expect(evaluerOperation(marquer("faite"), serveur("faite", "Magalie"))).toEqual({ action: "deja_fait" });
  });

  test("une collègue a marqué le passage absent pendant que j'étais hors-ligne : conflit signalé", () => {
    const d = evaluerOperation(marquer("faite"), serveur("absent", "Magalie"));
    expect(d.action).toBe("conflit");
    if (d.action === "conflit") expect(d.message).toContain("Magalie");
  });

  test("passage reporté ou annulé entre-temps : conflit, rien d'appliqué", () => {
    expect(evaluerOperation(marquer("faite"), serveur("reportee", "Magalie")).action).toBe("conflit");
    const annule = evaluerOperation(marquer("faite"), serveur("annulee"));
    expect(annule).toEqual({ action: "conflit", message: "Cette visite a été annulée entre-temps." });
  });

  test("un passage déjà validé par une collègue n'est jamais écrasé par « absent » hors-ligne", () => {
    const d = evaluerOperation(marquer("absent"), serveur("faite", "Magalie"));
    expect(d.action).toBe("conflit");
  });

  test("visite supprimée / inconnue : conflit", () => {
    expect(evaluerOperation(marquer("faite"), null).action).toBe("conflit");
  });

  test("rejouer deux fois la même opération est sans effet la seconde fois", () => {
    // 1re fois : prevue -> appliquer ; 2e fois : le serveur est déjà « faite » -> déjà fait.
    expect(evaluerOperation(marquer("faite"), serveur("prevue")).action).toBe("appliquer");
    expect(evaluerOperation(marquer("faite"), serveur("faite", "Moi")).action).toBe("deja_fait");
  });
});

describe("report à demain hors-ligne", () => {
  test("prévue : appliqué ; déjà reportée : déjà fait ; validée entre-temps : conflit", () => {
    expect(evaluerOperation(decaler, serveur("prevue")).action).toBe("appliquer");
    expect(evaluerOperation(decaler, serveur("reportee", "Moi")).action).toBe("deja_fait");
    expect(evaluerOperation(decaler, serveur("faite", "Magalie")).action).toBe("conflit");
  });
});

describe("résultat renvoyé au client", () => {
  test("conflit : message, statut serveur, auteur et heure pour l'afficher", () => {
    const op = marquer("faite");
    const s = serveur("absent", "Magalie");
    const r = versResultat(op, s, evaluerOperation(op, s));
    expect(r).toMatchObject({ id: "op1", etat: "conflit", statutServeur: "absent", parPrenom: "Magalie" });
    expect(r.quand).toBe("2026-10-17T09:30:00.000Z");
  });
});

describe("compactage de la file", () => {
  const op = (id: string, visiteId: string): OperationHorsLigne => ({ id, type: "decaler", visiteId, statutConnu: "prevue", creeLe: 0 });
  test("seule la dernière opération par visite est envoyée, l'ordre est conservé", () => {
    const file = [op("a", "v1"), op("b", "v2"), op("c", "v1"), op("d", "v3")];
    expect(compacterFile(file).map((o) => o.id)).toEqual(["b", "c", "d"]);
    expect(compacterFile([])).toEqual([]);
  });

  test("le statut connu retenu est celui de la première opération (le serveur n'a jamais vu les suivantes)", () => {
    const faite: OperationHorsLigne = { id: "1", type: "marquer", visiteId: "v1", statut: "faite", statutConnu: "prevue", creeLe: 1 };
    // Après la validation locale, l'appareil croit la visite « faite » : la correction part de cet état local.
    const correction: OperationHorsLigne = { id: "2", type: "marquer", visiteId: "v1", statut: "absent", statutConnu: "faite", creeLe: 2 };
    const [seule] = compacterFile([faite, correction]) as OperationStatut[];
    expect(seule.id).toBe("2");
    expect(seule.statutConnu).toBe("prevue");
    expect(evaluerOperation(seule, serveur("prevue")).action).toBe("appliquer");
  });

  test("arrivée : la première est gardée ; déplacements : tous gardés, dans l'ordre ; statut inchangé par eux", () => {
    const arrivee1: OperationHorsLigne = { id: "a1", type: "arrivee", visiteId: "v1", creeLe: 1 };
    const arrivee2: OperationHorsLigne = { id: "a2", type: "arrivee", visiteId: "v1", creeLe: 5 };
    const haut: OperationHorsLigne = { id: "d1", type: "deplacer", visiteId: "v1", sens: "haut", creeLe: 2 };
    const bas: OperationHorsLigne = { id: "d2", type: "deplacer", visiteId: "v1", sens: "bas", creeLe: 3 };
    const faite: OperationHorsLigne = { id: "f", type: "marquer", visiteId: "v1", statut: "faite", statutConnu: "prevue", creeLe: 4 };
    expect(compacterFile([arrivee1, haut, bas, faite, arrivee2]).map((o) => o.id)).toEqual(["a1", "d1", "d2", "f"]);
  });
});
