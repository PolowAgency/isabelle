import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/password";
import { authLookupSoignante } from "@/lib/db";
import { demoSoignantes, isDemoModeEnabled } from "@/lib/demo-data";
import { authConfig } from "./auth.config";

// Config complète (runtime Node uniquement — route handlers, Server
// Actions, Server Components). Provider Credentials, pas d'inscription
// libre. Comptes stockés dans `soignantes` (voir migrations/), mots de
// passe hashés en argon2. Session JWT — aucune table de session côté base.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        if (isDemoModeEnabled()) {
          const soignante = demoSoignantes.find(
            (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.actif
          );
          if (soignante && password.trim().length > 0) {
            return {
              id: soignante.id,
              name: `${soignante.prenom} ${soignante.nom}`,
              email: soignante.email,
              role: soignante.role,
              couleur: soignante.couleur,
            };
          }
        }

        const soignante = await authLookupSoignante(email);
        if (!soignante || !soignante.actif) return null;

        const today = new Date().toISOString().slice(0, 10);
        if (soignante.dateFin && soignante.dateFin < today) return null;

        const valid = await verifyPassword(soignante.passwordHash, password);
        if (!valid) return null;

        return {
          id: soignante.id,
          name: `${soignante.prenom} ${soignante.nom}`,
          email: soignante.email,
          role: soignante.role,
          couleur: soignante.couleur,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.couleur = user.couleur;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "titulaire" | "remplacante";
      session.user.couleur = token.couleur as string;
      return session;
    },
  },
});
