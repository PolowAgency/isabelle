import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "titulaire" | "remplacante";
    couleur: string;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: "titulaire" | "remplacante";
      couleur: string;
      sessionVersion: number;
      connecteLe: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "titulaire" | "remplacante";
    couleur: string;
    sessionVersion: number;
    connecteLe: number;
  }
}
