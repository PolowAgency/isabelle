import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { construireCsp, origineDe } from "@/lib/csp";

// Edge runtime : utilise la config allégée (auth.config.ts), sans argon2 ni
// lib/db.ts. La re-vérification autoritaire de actif/date_fin se fait à
// chaque requête via RLS (voir getCurrentSoignante) : une session dont la
// soignante est devenue inactive ne peut plus lire aucune donnée, même si
// le cookie persiste.
//
// Le middleware pose aussi la CSP avec un nonce par requête (Next le transmet à
// ses propres scripts via l'en-tête de requête).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = construireCsp({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    origineStockage: origineDe(process.env.S3_ENDPOINT),
  });

  // En-têtes de la requête d'origine (cookies compris) + nonce et CSP.
  const entetes = new Headers(req.headers);
  entetes.set("x-nonce", nonce);
  entetes.set("content-security-policy", csp);

  const reponse = NextResponse.next({ request: { headers: entetes } });
  reponse.headers.set("content-security-policy", csp);
  return reponse;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon|apple-icon|api/auth|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
