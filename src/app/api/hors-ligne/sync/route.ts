import { NextResponse } from "next/server";
import { getSoignanteApi } from "@/lib/current-soignante";
import { rejouerOperations } from "@/lib/offline/sync";
import { ErreurMetier } from "@/lib/resultat";
import { schemas, valider } from "@/lib/validation";

// Rejeu des actions faites hors-ligne. Chaque opération est comparée à l'état
// du serveur : pas d'écrasement silencieux (voir src/lib/offline/regles.ts).
export const dynamic = "force-dynamic";

const ENTETES = { "Cache-Control": "no-store, private" };

export async function POST(request: Request) {
  // Défense contre les requêtes inter-sites : seul un fetch JSON de l'application passe.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 415, headers: ENTETES });
  }

  const soignante = await getSoignanteApi();
  if (!soignante) {
    return NextResponse.json({ error: "Session expirée : reconnectez-vous." }, { status: 401, headers: ENTETES });
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400, headers: ENTETES });
  }

  try {
    const { operations } = valider(schemas.operationsHorsLigne, corps);
    const resultats = await rejouerOperations(soignante.id, operations);
    return NextResponse.json({ resultats }, { headers: ENTETES });
  } catch (error) {
    if (error instanceof ErreurMetier) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: ENTETES });
    }
    throw error;
  }
}
