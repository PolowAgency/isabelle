import { describe, expect, test } from "vitest";
import { adresseComplete, lienAppel, lienGoogleMaps, lienWaze } from "./itineraire";

describe("itinéraire et appel", () => {
  test("adresse complète encodée pour Google Maps et Waze", () => {
    const a = { adresse: "12 rue de l'Église", codePostal: "35000", ville: "Rennes" };
    expect(adresseComplete(a)).toBe("12 rue de l'Église, 35000 Rennes");
    expect(lienGoogleMaps(a)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=12%20rue%20de%20l'%C3%89glise%2C%2035000%20Rennes&travelmode=driving"
    );
    expect(lienWaze(a)).toContain("https://waze.com/ul?q=12%20rue");
  });

  test("sans rue, pas d'itinéraire", () => {
    expect(lienGoogleMaps({ adresse: null, ville: "Rennes" })).toBeNull();
    expect(lienWaze({ adresse: "  ", ville: "Rennes" })).toBeNull();
  });

  test("téléphone : espaces et points ignorés, numéro trop court refusé", () => {
    expect(lienAppel("02 99 12 34 56")).toBe("tel:0299123456");
    expect(lienAppel("+33 2 99 12 34 56")).toBe("tel:+33299123456");
    expect(lienAppel("12")).toBeNull();
    expect(lienAppel(null)).toBeNull();
  });
});
