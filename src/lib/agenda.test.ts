import { describe, expect, test } from "vitest";
import { absencesDuJour, grilleSemaine, type VisiteAgenda } from "./agenda";
import { joursDeLaSemaine, lundiDe } from "./date";
import { reglagesParDefaut } from "./planning-calc";

const { durees } = reglagesParDefaut();
const v = (
  date: string,
  tranche: string,
  extra: Partial<VisiteAgenda> = {}
): VisiteAgenda => ({ date, tranche, statut: "prevue", soignanteId: "s1", actes: ["toilette"], dureeEstimeeMin: null, ...extra });

describe("grille jours × tranches", () => {
  const jours = joursDeLaSemaine("2026-10-12");

  test("8 lignes (tranches) × 7 colonnes (jours), vides par défaut", () => {
    const g = grilleSemaine([], jours, durees, 120);
    expect(g).toHaveLength(8);
    expect(g.every((ligne) => ligne.length === 7)).toBe(true);
    expect(g[0][0]).toMatchObject({ jour: "2026-10-12", tranche: "6-8", nombre: 0, etat: "vide" });
  });

  test("nombre de patients et durée par case ; annulées et reportées ne comptent pas ; hors semaine ignorées", () => {
    const g = grilleSemaine(
      [
        v("2026-10-12", "8-10"),
        v("2026-10-12", "8-10", { actes: ["injection"] }),
        v("2026-10-12", "8-10", { statut: "faite", dureeEstimeeMin: 50 }),
        v("2026-10-12", "8-10", { statut: "annulee" }),
        v("2026-10-12", "8-10", { statut: "reportee" }),
        v("2026-10-19", "8-10"), // semaine suivante
        v("2026-10-14", "inconnue"),
      ],
      jours,
      durees,
      120
    );
    expect(g[1][0]).toMatchObject({ nombre: 3, dureeMin: 30 + 10 + 50, chargeMaxMin: 90, etat: "ok" });
    expect(g.flat().reduce((n, c) => n + c.nombre, 0)).toBe(3);
  });

  test("la charge est celle de la soignante la plus chargée, pas la somme de l'équipe", () => {
    const equipe = [
      v("2026-10-13", "8-10", { soignanteId: "a", dureeEstimeeMin: 70 }),
      v("2026-10-13", "8-10", { soignanteId: "b", dureeEstimeeMin: 70 }),
    ];
    const toutes = grilleSemaine(equipe, jours, durees, 120)[1][1];
    expect(toutes).toMatchObject({ nombre: 2, dureeMin: 140, chargeMaxMin: 70, etat: "ok" });
    const seule = grilleSemaine([...equipe, v("2026-10-13", "8-10", { soignanteId: "a", dureeEstimeeMin: 60 })], jours, durees, 120, "a")[1][1];
    expect(seule).toMatchObject({ nombre: 2, chargeMaxMin: 130, etat: "depasse" });
  });

  test("seuils de couleur : proche à 80 % de la capacité, dépassée au-delà", () => {
    const g = grilleSemaine(
      [v("2026-10-15", "10-12", { dureeEstimeeMin: 100 }), v("2026-10-16", "10-12", { dureeEstimeeMin: 130 })],
      jours,
      durees,
      120
    );
    expect(g[2][3].etat).toBe("proche");
    expect(g[2][4].etat).toBe("depasse");
  });

  test("changement d'heure d'automne (dimanche 25 oct. 2026) : chaque jour garde sa case, aucun décalage", () => {
    const semaine = joursDeLaSemaine(lundiDe("2026-10-25"));
    expect(semaine).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    const g = grilleSemaine([v("2026-10-24", "6-8"), v("2026-10-25", "6-8"), v("2026-10-25", "20-21")], semaine, durees, 120);
    expect(g[0][5].nombre).toBe(1); // samedi
    expect(g[0][6].nombre).toBe(1); // dimanche, jour de 25 h
    expect(g[7][6].nombre).toBe(1);
    expect(new Set(semaine).size).toBe(7);
  });

  test("changement d'heure de printemps (dimanche 29 mars 2026) : idem", () => {
    const semaine = joursDeLaSemaine(lundiDe("2026-03-29"));
    expect(semaine[6]).toBe("2026-03-29");
    const g = grilleSemaine([v("2026-03-29", "8-10"), v("2026-03-28", "8-10")], semaine, durees, 120);
    expect(g[1][5].nombre).toBe(1);
    expect(g[1][6].nombre).toBe(1);
  });

  test("absences d'un jour : bornes incluses", () => {
    const a = [
      { id: "1", dateDebut: "2026-10-13", dateFin: "2026-10-15" },
      { id: "2", dateDebut: "2026-10-15", dateFin: "2026-10-20" },
    ];
    expect(absencesDuJour(a, "2026-10-12")).toHaveLength(0);
    expect(absencesDuJour(a, "2026-10-13").map((x) => x.id)).toEqual(["1"]);
    expect(absencesDuJour(a, "2026-10-15").map((x) => x.id)).toEqual(["1", "2"]);
    expect(absencesDuJour(a, "2026-10-20").map((x) => x.id)).toEqual(["2"]);
  });
});
