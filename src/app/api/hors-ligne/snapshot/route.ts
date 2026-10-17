import { NextResponse } from "next/server";
import { getSoignanteApi } from "@/lib/current-soignante";
import { construireInstantane } from "@/lib/offline/snapshot";

// Instantané de la tournée du jour (et des fiches utiles) pour le mode hors-ligne.
// Données de santé : jamais mises en cache par le navigateur ni par un proxy ;
// l'appareil les chiffre avant de les conserver.
export const dynamic = "force-dynamic";

const ENTETES = { "Cache-Control": "no-store, private" };

export async function GET() {
  const soignante = await getSoignanteApi();
  if (!soignante) {
    return NextResponse.json({ error: "Session expirée : reconnectez-vous." }, { status: 401, headers: ENTETES });
  }
  const instantane = await construireInstantane(soignante.id);
  return NextResponse.json(instantane, { headers: ENTETES });
}
