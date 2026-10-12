import { sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { isDemoModeEnabled } from "@/lib/demo-data";
import { patients, soignantes, visites } from "@/lib/schema";

export type Onboarding = {
  patients: number;
  visites: number;
  equipe: number;
};

/**
 * Compteurs pour la carte « Premiers pas » : quand ils sont tous > 0, la
 * carte disparaît d'elle-même. Jamais bloquant pour l'écran Tournée.
 */
export async function getOnboarding(soignanteId: string): Promise<Onboarding> {
  if (isDemoModeEnabled()) return { patients: 1, visites: 1, equipe: 2 };

  try {
    return await withSoignante(soignanteId, async (tx) => {
      const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(patients);
      const [v] = await tx.select({ n: sql<number>`count(*)::int` }).from(visites);
      const [e] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(soignantes)
        .where(sql`${soignantes.actif}`);
      return { patients: p.n, visites: v.n, equipe: e.n };
    });
  } catch {
    return { patients: 1, visites: 1, equipe: 2 };
  }
}
