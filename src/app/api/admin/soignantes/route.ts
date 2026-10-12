import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { soignantePublicColumns, withSoignante } from "@/lib/db";
import { soignantes } from "@/lib/schema";
import { createRemplacanteForSoignante, isIsabelleAdmin } from "@/lib/team";

// Réservé aux comptes admin (voir isIsabelleAdmin) : sans cette vérification,
// n'importe quelle soignante authentifiée — y compris une remplaçante
// temporaire — pouvait créer de nouveaux comptes via cette route, en
// contournant le contrôle appliqué côté Server Action (createRemplacanteAction).
export async function POST(request: Request) {
  const session = await auth();
  const soignanteId = session?.user?.id;

  if (!soignanteId) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  const rows = await withSoignante(soignanteId, (tx) =>
    tx
      .select(soignantePublicColumns)
      .from(soignantes)
      .where(eq(soignantes.id, soignanteId))
      .limit(1)
  );
  const current = rows[0];

  if (!current || !isIsabelleAdmin(current)) {
    return NextResponse.json({ error: "Accès réservé à Isabelle." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      role?: "titulaire" | "remplacante";
      prenom?: string;
      nom?: string;
      email?: string;
      remplaceId?: string | null;
      dateDebut?: string;
      dateFin?: string | null;
    };

    const result = await createRemplacanteForSoignante(soignanteId, {
      role: body.role,
      prenom: body.prenom ?? "",
      nom: body.nom ?? "",
      email: body.email ?? "",
      remplaceId: body.remplaceId ?? null,
      dateDebut: body.dateDebut ?? "",
      dateFin: body.dateFin ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Creation impossible." },
      { status: 400 }
    );
  }
}
