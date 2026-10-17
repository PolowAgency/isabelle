// Vérifie que DATABASE_URL désigne un rôle conforme (ni superuser, ni BYPASSRLS).
// Usage : npm run check:rls   (code de sortie 1 si non conforme)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { MESSAGE_ROLE_NON_CONFORME, verifierRoleBase } from "../src/lib/rls-check";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL n'est pas défini.");
    process.exit(1);
  }
  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const resultat = await verifierRoleBase(async (texte) => client.unsafe(texte) as never);
    if (!resultat.ok) {
      console.error(MESSAGE_ROLE_NON_CONFORME);
      for (const probleme of resultat.problemes) console.error(`- ${probleme}`);
      process.exit(1);
    }
    console.log("OK : le rôle de connexion est soumis à la RLS (ni superuser, ni BYPASSRLS).");
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("Vérification impossible (base injoignable ?).");
  process.exit(1);
});
