import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "titulaire" | "remplacante";
    couleur: string;
  }

  interface Session {
    user: {
      id: string;
      role: "titulaire" | "remplacante";
      couleur: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "titulaire" | "remplacante";
    couleur: string;
  }
}
