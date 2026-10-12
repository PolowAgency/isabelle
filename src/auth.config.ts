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

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
