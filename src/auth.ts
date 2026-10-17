import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { ipDepuisEntetes } from "@/lib/login-guard";
import { tenterConnexion } from "@/lib/login";
import { demoSoignantes, isDemoModeEnabled } from "@/lib/demo-data";
import { todayISO } from "@/lib/date";
import { authConfig } from "./auth.config";

// Config complète (runtime Node uniquement — route handlers, Server
// Actions, Server Components). Provider Credentials, pas d'inscription
// libre. Comptes stockés dans `soignantes` (voir migrations/), mots de
// passe hashés en argon2. Session JWT — aucune table de session côté base.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  trustHost: true,
  // Session glissante : 12 h d'inactivité au maximum (renouvelée toutes les heures
  // d'activité), et 3 jours au plus depuis la connexion (vérifié dans
  // getCurrentSoignante, voir SESSION_MAX_JOURS).
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        if (email.length > 254 || password.length > 1024) return null;

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
              sessionVersion: soignante.sessionVersion,
            };
          }
        }

        const resultat = await tenterConnexion(
          email,
          password,
          ipDepuisEntetes(request.headers),
          todayISO()
        );
        if (!resultat.ok) return null;

        const soignante = resultat.soignante;
        return {
          id: soignante.id,
          name: `${soignante.prenom} ${soignante.nom}`,
          email: soignante.email,
          role: soignante.role,
          couleur: soignante.couleur,
          sessionVersion: soignante.sessionVersion,
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
        // Version de session (« se déconnecter partout ») et début de la
        // connexion (durée de vie maximale, voir SESSION_MAX_JOURS).
        token.sessionVersion = user.sessionVersion;
        token.connecteLe = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "titulaire" | "remplacante";
      session.user.couleur = token.couleur as string;
      session.user.sessionVersion = (token.sessionVersion as number | undefined) ?? 0;
      session.user.connecteLe = (token.connecteLe as number | undefined) ?? 0;
      return session;
    },
  },
});
