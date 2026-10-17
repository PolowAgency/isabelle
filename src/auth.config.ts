import type { NextAuthConfig } from "next-auth";

// Config Edge-safe, utilisée par le middleware : aucune dépendance à
// argon2 ni à lib/db.ts (Node-only : Postgres, crypto natif). Le provider
// Credentials et les callbacks jwt/session, qui en dépendent, sont ajoutés
// séparément dans auth.ts (exécuté uniquement en runtime Node).
export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");

      // Coquille du mode hors-ligne : aucune donnée, doit pouvoir se charger sans
      // session (réseau absent, session expirée). Les données viennent de l'appareil.
      if (request.nextUrl.pathname === "/hors-ligne") return true;

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
