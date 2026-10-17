import "server-only";

import { sql, type SQL } from "drizzle-orm";
import webpush from "web-push";
import { withSoignante } from "@/lib/db";
import { construireNotification, type MotifNotification } from "@/lib/push-messages";

// Envoi de notifications push (Web Push, VAPID). L'envoi ne doit JAMAIS faire échouer
// l'action qui le déclenche (transfert, transmission) : toutes les erreurs sont absorbées,
// sans rien journaliser du contenu.

/** Tableau Postgres d'UUID (un paramètre tableau serait développé en liste par le pilote). */
function tableauUuid(ids: string[]): SQL {
  if (ids.length === 0) return sql`array[]::uuid[]`;
  return sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
}

export function pushConfigure(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

type Abonnement = { id: string; soignante_id: string; endpoint: string; p256dh: string; auth: string };

const DELAI_ENVOI_MS = 5000;

export async function notifier(
  expediteurId: string,
  motif: MotifNotification,
  options: { cibles?: string[]; exclureExpediteur?: boolean } = {}
): Promise<void> {
  if (!pushConfigure()) return;

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const abonnements = await withSoignante(expediteurId, async (tx) => {
      const lignes = await tx.execute<Abonnement>(sql`
        select * from push_destinataires(
          ${motif},
          ${options.cibles ? tableauUuid(options.cibles) : sql`null::uuid[]`},
          ${options.exclureExpediteur ? expediteurId : null}::uuid
        )`);
      return Array.from(lignes) as Abonnement[];
    });
    if (abonnements.length === 0) return;

    const contenu = JSON.stringify(construireNotification(motif));
    const invalides: string[] = [];

    await Promise.allSettled(
      abonnements.map(async (a) => {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            contenu,
            { TTL: 3600, urgency: motif === "urgence" ? "high" : "normal", timeout: DELAI_ENVOI_MS }
          );
        } catch (erreur) {
          const statut = (erreur as { statusCode?: number }).statusCode;
          // 404 / 410 : l'appareil s'est désabonné ou n'existe plus.
          if (statut === 404 || statut === 410) invalides.push(a.id);
        }
      })
    );

    if (invalides.length > 0) {
      await withSoignante(expediteurId, (tx) =>
        tx.execute(sql`select push_supprimer(${tableauUuid(invalides)})`)
      );
    }
  } catch {
    // Silencieux : une notification manquée ne doit pas casser l'action métier.
    console.warn("Envoi de notification push impossible.");
  }
}
