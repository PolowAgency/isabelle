import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import { aReChiffrer, chiffrer, contexteAcces, dechiffrer, estChiffre } from "./crypto";

const cle = () => randomBytes(32).toString("base64");

describe("chiffrement AES-256-GCM", () => {
  const avant = { ...process.env };
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = cle();
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  });
  afterEach(() => {
    process.env = { ...avant };
  });

  test("aller-retour, valeur différente à chaque chiffrement", () => {
    const ctx = contexteAcces("p1", "codePortail");
    const a = chiffrer("B12A", ctx)!;
    const b = chiffrer("B12A", ctx)!;
    expect(a).not.toBe(b);
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(a).not.toContain("B12A");
    expect(dechiffrer(a, ctx)).toBe("B12A");
  });

  test("accents et caractères spéciaux", () => {
    const ctx = contexteAcces("p1", "notesAcces");
    expect(dechiffrer(chiffrer("Clé sous le pot — « bleu » 🔑", ctx), ctx)).toBe("Clé sous le pot — « bleu » 🔑");
  });

  test("vide / null restent null", () => {
    expect(chiffrer(null, "x")).toBeNull();
    expect(chiffrer("", "x")).toBeNull();
    expect(dechiffrer(null, "x")).toBeNull();
  });

  test("valeur historique en clair : lue telle quelle, à re-chiffrer", () => {
    expect(estChiffre("B12A")).toBe(false);
    expect(dechiffrer("B12A", "x")).toBe("B12A");
    expect(aReChiffrer("B12A")).toBe(true);
    expect(aReChiffrer(null)).toBe(false);
    expect(aReChiffrer(chiffrer("B12A", "x"))).toBe(false);
  });

  test("le contexte est authentifié : copie dans une autre ligne ou un autre champ refusée", () => {
    const c = chiffrer("4598", contexteAcces("patient-1", "digicodePorte"))!;
    expect(() => dechiffrer(c, contexteAcces("patient-2", "digicodePorte"))).toThrow("illisible");
    expect(() => dechiffrer(c, contexteAcces("patient-1", "codePortail"))).toThrow("illisible");
  });

  test("altération détectée, message sans fuite", () => {
    const ctx = "ctx";
    const c = chiffrer("secret-123", ctx)!;
    const parties = c.split(":");
    parties[5] = Buffer.from("autre chose").toString("base64url");
    let message = "";
    try {
      dechiffrer(parties.join(":"), ctx);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("Donnée chiffrée illisible.");
    expect(message).not.toContain("secret");
  });

  test("rotation : ancienne clé encore lisible, re-chiffrement avec la nouvelle", () => {
    const ancienne = process.env.DATA_ENCRYPTION_KEY!;
    const ctx = contexteAcces("p1", "codeImmeuble");
    const vieux = chiffrer("7625", ctx)!;

    process.env.DATA_ENCRYPTION_KEY = cle();
    // Sans l'ancienne clé : illisible.
    expect(() => dechiffrer(vieux, ctx)).toThrow("illisible");
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = ancienne;
    expect(dechiffrer(vieux, ctx)).toBe("7625");
    expect(aReChiffrer(vieux)).toBe(true);

    const neuf = chiffrer(dechiffrer(vieux, ctx), ctx)!;
    expect(aReChiffrer(neuf)).toBe(false);
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    expect(dechiffrer(neuf, ctx)).toBe("7625");
  });

  test("clé absente ou invalide : erreur claire", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => chiffrer("x", "c")).toThrow("DATA_ENCRYPTION_KEY n'est pas défini");
    process.env.DATA_ENCRYPTION_KEY = "trop-court";
    expect(() => chiffrer("x", "c")).toThrow("invalide");
  });
});
