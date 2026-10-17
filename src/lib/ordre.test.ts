import { describe, expect, test } from "vitest";
import { deplacerDansListe, deplacerVisitesDansTranche } from "./ordre";

describe("réordonnancement d'une tranche", () => {
  const liste = ["a", "b", "c", "d"];

  test("monter et descendre d'un cran", () => {
    expect(deplacerDansListe(liste, "c", "haut")).toEqual(["a", "c", "b", "d"]);
    expect(deplacerDansListe(liste, "b", "bas")).toEqual(["a", "c", "b", "d"]);
  });

  test("impossible en tête / en queue / id inconnu", () => {
    expect(deplacerDansListe(liste, "a", "haut")).toBeNull();
    expect(deplacerDansListe(liste, "d", "bas")).toBeNull();
    expect(deplacerDansListe(liste, "z", "bas")).toBeNull();
  });

  test("les visites déjà traitées gardent leur place : échange avec la voisine à faire", () => {
    expect(deplacerDansListe(liste, "c", "haut", new Set(["b"]))).toEqual(["c", "b", "a", "d"]);
    expect(deplacerDansListe(liste, "a", "bas", new Set(["b", "c"]))).toEqual(["d", "b", "c", "a"]);
    expect(deplacerDansListe(liste, "a", "haut", new Set(["b"]))).toBeNull();
    expect(deplacerDansListe(liste, "b", "haut", new Set(["b"]))).toBeNull();
  });
});

describe("réordonnancement dans une liste de visites", () => {
  const v = (id: string, tranche: string, statut = "prevue", soignanteId = "s1") => ({ id, tranche, statut, soignanteId });
  const ids = (l: { id: string }[]) => l.map((x) => x.id);

  test("seule la tranche concernée est réordonnée, les autres gardent leur place", () => {
    const liste = [v("a", "8-10"), v("b", "8-10"), v("c", "10-12"), v("d", "8-10")];
    expect(ids(deplacerVisitesDansTranche(liste, "d", "haut"))).toEqual(["a", "d", "c", "b"]);
  });

  test("les visites d'une autre soignante (vue équipe) ne sont pas touchées", () => {
    const liste = [v("a", "8-10", "prevue", "s1"), v("x", "8-10", "prevue", "s2"), v("b", "8-10", "prevue", "s1")];
    expect(ids(deplacerVisitesDansTranche(liste, "b", "haut"))).toEqual(["b", "x", "a"]);
  });

  test("une visite déjà faite est sautée et ne bouge pas", () => {
    const liste = [v("a", "8-10"), v("b", "8-10", "faite"), v("c", "8-10")];
    expect(ids(deplacerVisitesDansTranche(liste, "c", "haut"))).toEqual(["c", "b", "a"]);
    expect(ids(deplacerVisitesDansTranche(liste, "b", "haut"))).toEqual(["a", "b", "c"]);
  });
});
