import { NextResponse } from "next/server";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { auditerSeul } from "@/lib/audit";
import { ErreurMetier } from "@/lib/resultat";
import { createRemplacanteForSoignante, isAdmin } from "@/lib/team";
import { schemas, valider } from "@/lib/validation";

// Réservé aux administrateurs (colonne est_admin) : sans cette vérification,
// n'importe quelle soignante authentifiée pouvait créer des comptes via cette route.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const current = await getCurrentSoignante();

  if (!isAdmin(current)) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const entree = valider(schemas.creerCompte, corps);
    const cree = await createRemplacanteForSoignante(current.id, entree);
    await auditerSeul(current.id, { action: "compte_cree", entite: "soignante", entiteId: cree.id });
    return NextResponse.json({ email: cree.email, password: cree.password });
  } catch (error) {
    if (error instanceof ErreurMetier) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Message générique : aucun détail technique ni donnée en réponse.
    return NextResponse.json({ error: "Création impossible." }, { status: 400 });
  }
}
