import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withSoignante, soignantePublicColumns } from "@/lib/db";
import { getDemoCurrentSoignante, isDemoModeEnabled, isOfflineDbError } from "@/lib/demo-data";
import { soignantes } from "@/lib/schema";
import type { PublicSoignante } from "@/lib/schema";

/**
 * Session valide (JWT, Edge) ET soignante active en base (RLS) : si le
 * compte a été désactivé ou que la date_fin d'une remplaçante est dépassée,
 * la policy RLS bloque la lecture de sa propre ligne et on retombe sur le
 * login, même si le cookie de session est toujours techniquement valide.
 */
export async function getCurrentSoignante(): Promise<PublicSoignante> {
  const session = await auth();
  if (!session?.user?.id) {
    if (isDemoModeEnabled()) {
      return getDemoCurrentSoignante();
    }
    redirect("/login");
  }

  try {
    const rows = await withSoignante(session.user.id, (tx) =>
      tx
        .select(soignantePublicColumns)
        .from(soignantes)
        .where(eq(soignantes.id, session.user.id))
    );

    const soignante = rows[0];
    if (!soignante) {
      if (isDemoModeEnabled()) {
        return getDemoCurrentSoignante();
      }
      redirect("/login?expire=1");
    }

    return soignante;
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoCurrentSoignante();
    }
    throw error;
  }
}
