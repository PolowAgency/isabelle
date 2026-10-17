import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getSoignanteApi } from "@/lib/current-soignante";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { ErreurMetier } from "@/lib/resultat";
import { pushSubscriptions } from "@/lib/schema";
import { schemas, valider } from "@/lib/validation";

// Abonnement push d'un appareil : toujours après un geste explicite de la soignante
// (permission du navigateur + activation dans Compte). Aucune donnée de santé ici.
export const dynamic = "force-dynamic";

const ENTETES = { "Cache-Control": "no-store, private" };
const reponse = (corps: unknown, status = 200) => NextResponse.json(corps, { status, headers: ENTETES });

async function contexte(request: Request, ecriture: boolean) {
  if (ecriture && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { erreur: reponse({ error: "Requête invalide." }, 415) };
  }
  const soignante = await getSoignanteApi();
  if (!soignante) return { erreur: reponse({ error: "Session expirée : reconnectez-vous." }, 401) };
  return { soignante };
}

function erreurMetier(e: unknown) {
  if (e instanceof ErreurMetier) return reponse({ error: e.message }, 400);
  throw e;
}

/** État de cet appareil (abonné ? préférences). */
export async function GET(request: Request) {
  const ctx = await contexte(request, false);
  if (ctx.erreur) return ctx.erreur;
  try {
    const { endpoint } = valider(schemas.pushDesabonnement, { endpoint: new URL(request.url).searchParams.get("endpoint") });
    const [ligne] = await withSoignante(ctx.soignante.id, (tx) =>
      tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1)
    );
    return reponse(
      ligne
        ? { abonne: true, notifierTransferts: ligne.notifierTransferts, notifierUrgences: ligne.notifierUrgences }
        : { abonne: false }
    );
  } catch (e) {
    return erreurMetier(e);
  }
}

/** Active (ou met à jour les préférences d') un appareil. */
export async function POST(request: Request) {
  const ctx = await contexte(request, true);
  if (ctx.erreur) return ctx.erreur;
  try {
    const corps = valider(schemas.pushAbonnement, await request.json().catch(() => null));
    await withSoignante(ctx.soignante.id, async (tx) => {
      await tx.execute(sql`select push_enregistrer(
        ${corps.endpoint}, ${corps.keys.p256dh}, ${corps.keys.auth},
        ${corps.notifierTransferts}, ${corps.notifierUrgences}
      )`);
      await auditer(tx, { action: "notifications_activees", entite: "notifications", dedoublonnerMinutes: 1 });
    });
    return reponse({ ok: true });
  } catch (e) {
    return erreurMetier(e);
  }
}

/** Désactive les notifications sur cet appareil. */
export async function DELETE(request: Request) {
  const ctx = await contexte(request, true);
  if (ctx.erreur) return ctx.erreur;
  try {
    const { endpoint } = valider(schemas.pushDesabonnement, await request.json().catch(() => null));
    await withSoignante(ctx.soignante.id, async (tx) => {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
      await auditer(tx, { action: "notifications_desactivees", entite: "notifications", dedoublonnerMinutes: 1 });
    });
    return reponse({ ok: true });
  } catch (e) {
    return erreurMetier(e);
  }
}
