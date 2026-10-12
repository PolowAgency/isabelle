// Supprime toutes les données patients de démo (secteurs, patients, visites,
// transmissions, ordonnances, traitements, accès domicile, documents) pour
// repartir d'une base vide. Ne touche jamais à la table `soignantes` (comptes
// de connexion) : voir bootstrap-team.ts pour la gestion des comptes.
//
// Usage : npm run db:reset

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/schema";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Suppression des données patients (démo)…");
  await db.delete(schema.transmissions);
  await db.delete(schema.documents);
  await db.delete(schema.visites);
  await db.delete(schema.traitements);
  await db.delete(schema.ordonnances);
  await db.delete(schema.accesDomicile);
  await db.delete(schema.patients);
  await db.delete(schema.secteurs);

  console.log("Base vidée. Comptes soignantes conservés.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
