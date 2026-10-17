import { getCurrentSoignante } from "@/lib/current-soignante";
import { ErreurMetier } from "@/lib/resultat";
import { journalVersCsv, lireJournalPassages, periodeValide } from "@/lib/export";

// Export CSV du journal des passages. Données de santé : réponse jamais mise
// en cache, aucune donnée dans les logs.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const demandeur = await getCurrentSoignante();
  const params = new URL(request.url).searchParams;

  try {
    const { du, au } = periodeValide(params.get("du") ?? undefined, params.get("au") ?? undefined);
    const { lignes } = await lireJournalPassages(demandeur, {
      du,
      au,
      soignanteId: params.get("soignante") || null,
    });

    return new Response(journalVersCsv(lignes), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="passages_${du}_${au}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ErreurMetier) {
      const interdit = error.message.startsWith("Vous ne pouvez exporter");
      return new Response(error.message, {
        status: interdit ? 403 : 400,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    throw error;
  }
}
