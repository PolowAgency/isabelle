import { describe, expect, test } from "vitest";
import { construireNotification } from "./push-messages";

describe("texte des notifications push", () => {
  test("chaînes figées, sans paramètre : aucune donnée variable ne peut y entrer", () => {
    expect(construireNotification.length).toBe(1); // un seul argument : le type d'événement
    const a = construireNotification("transfert");
    const b = construireNotification("transfert");
    expect(a).toEqual(b);
    expect(a.corps).toBe("Nouvelle demande de transfert à traiter.");
    expect(construireNotification("urgence").corps).toBe("Transmission urgente à lire.");
  });

  test("renvoie vers /alertes (le détail se lit après connexion), sans identifiant dans l'URL", () => {
    for (const motif of ["transfert", "urgence"] as const) {
      const n = construireNotification(motif);
      expect(n.url).toBe("/alertes");
      expect(n.url).not.toMatch(/[?#=]/);
      expect(JSON.stringify(n)).not.toMatch(/\d{4,}/);
    }
  });
});
