import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge runtime : utilise la config allégée (auth.config.ts), sans argon2 ni
// lib/db.ts. La re-vérification autoritaire de actif/date_fin se fait à
// chaque requête via RLS (voir getCurrentSoignante) : une session dont la
// soignante est devenue inactive ne peut plus lire aucune donnée, même si
// le cookie persiste.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon|apple-icon|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
