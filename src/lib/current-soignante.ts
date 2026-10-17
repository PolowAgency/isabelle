import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withSoignante, soignantePublicColumns } from "@/lib/db";
import { getDemoCurrentSoignante, isDemoModeEnabled, isOfflineDbError } from "@/lib/demo-data";
import { soignantes } from "@/lib/schema";
import type { PublicSoignante } from "@/lib/schema";

/** Durée de vie maximale d'une connexion, quelle que soit l'activité. */
export const SESSION_MAX_JOURS = 3;

/**
 * Fin de session : un Server Component ne peut pas effacer le cookie, on passe
 * donc par un route handler qui déconnecte puis renvoie vers /login. (Un simple
 * redirect vers /login bouclerait : le middleware renvoie vers « / » toute
 * personne dont le cookie est encore valide.)
 */
function finDeSession(motif: "expire" | "ailleurs" | "duree"): never {
  redirect(`/api/session-expiree?motif=${motif}`);
}

/**
 * Session valide (JWT, Edge) ET soignante active en base (RLS) : si le
 * compte a été désactivé ou que la date_fin d'une remplaçante est dépassée,
 * la policy RLS bloque la lecture de sa propre ligne et la session prend fin,
 * même si le cookie est toujours techniquement valide. Même chose si elle a été
 * déconnectée partout (session_version) ou si la connexion date de plus de 3 jours.
 * Un mot de passe temporaire doit être changé avant toute autre page.
 */
export async function getCurrentSoignante(
  options: { autoriserMotDePasseTemporaire?: boolean } = {}
): Promise<PublicSoignante> {
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
      finDeSession("expire");
    }

    if (soignante.sessionVersion !== session.user.sessionVersion) finDeSession("ailleurs");

    const age = Date.now() - session.user.connecteLe;
    if (!session.user.connecteLe || age > SESSION_MAX_JOURS * 24 * 60 * 60 * 1000) {
      finDeSession("duree");
    }

    if (soignante.mustChangePassword && !options.autoriserMotDePasseTemporaire) {
      redirect("/changer-mot-de-passe");
    }

    return soignante;
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoCurrentSoignante();
    }
    throw error;
  }
}
