import { describe, expect, test } from "vitest";
import { construireCsp, origineDe } from "./csp";

describe("CSP", () => {
  const csp = construireCsp({ nonce: "abc123", origineStockage: "https://s3.exemple.fr" });

  test("scripts : nonce uniquement, jamais unsafe-inline ni unsafe-eval en production", () => {
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
  });

  test("clic-jacking, objets, base et formulaires verrouillés", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  test("images : le stockage S3 est autorisé, aucun autre domaine", () => {
    const images = csp.split("; ").find((d) => d.startsWith("img-src"))!;
    expect(images).toContain("https://s3.exemple.fr");
    expect(images).not.toContain("*");
    expect(csp).toContain("connect-src 'self'");
  });

  test("développement : eval et websocket permis seulement là", () => {
    const dev = construireCsp({ nonce: "x", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  test("origine extraite d'une URL de stockage", () => {
    expect(origineDe("https://s3.fr-par.scw.cloud/bucket")).toBe("https://s3.fr-par.scw.cloud");
    expect(origineDe(undefined)).toBeNull();
    expect(origineDe("pas une url")).toBeNull();
  });
});
