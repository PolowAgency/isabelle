import postgres from "postgres";
import { MESSAGE_ROLE_NON_CONFORME, verifierRoleBase } from "@/lib/rls-check";

// En production, refuse de démarrer si la connexion Postgres contourne la RLS
// (superutilisateur ou BYPASSRLS) : la sécurité par ligne ne protégerait alors rien.

export async function controler() {
  if (process.env.NODE_ENV !== "production") return;
  // Pas pendant `next build` (pas de base joignable pour la CI de build).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return;

  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 });

  let resultat;
  try {
    resultat = await verifierRoleBase(async (texte) => client.unsafe(texte) as never);
  } catch {
    // Base momentanément injoignable : on ne bloque pas le démarrage pour une panne,
    // la vérification est refaite au prochain démarrage. Aucun détail dans les logs.
    console.warn("Vérification du rôle Postgres impossible au démarrage.");
    return;
  } finally {
    await client.end({ timeout: 2 }).catch(() => undefined);
  }

  if (!resultat.ok) throw new Error(MESSAGE_ROLE_NON_CONFORME);
}

