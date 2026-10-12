// Crée les comptes des trois titulaires si elles n'existent pas encore.
// Script d'administration hors requête HTTP : connexion directe (pas de
// import "@/lib/db", qui est réservé à l'application via server-only).
//
// Usage : npm run bootstrap:team

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import * as schema from "../src/lib/schema";

const COMPTES = [
  { prenom: "Isabelle", nom: "Titulaire", email: "isabelle@cabinet-test.local", couleur: "#25453a" },
  { prenom: "Magalie", nom: "Titulaire", email: "marion@cabinet-test.local", couleur: "#e0704a" },
  { prenom: "Severine", nom: "Titulaire", email: "camille@cabinet-test.local", couleur: "#8a6fb0" },
];

function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Identifiants créés (à noter maintenant, non réaffichés) :\n");

  for (const compte of COMPTES) {
    const existing = await db
      .select({ id: schema.soignantes.id })
      .from(schema.soignantes)
      .where(eq(schema.soignantes.email, compte.email));

    if (existing.length > 0) {
      await db
        .update(schema.soignantes)
        .set({
          prenom: compte.prenom,
          nom: compte.nom,
          couleur: compte.couleur,
        })
        .where(eq(schema.soignantes.email, compte.email));

      console.log(`- ${compte.email} : déjà existant, mis à jour.`);
      continue;
    }

    const password = generatePassword();
    const passwordHash = await argon2.hash(password);

    await db.insert(schema.soignantes).values({
      prenom: compte.prenom,
      nom: compte.nom,
      email: compte.email,
      passwordHash,
      couleur: compte.couleur,
      role: "titulaire",
    });

    console.log(`- ${compte.email} / ${password}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
