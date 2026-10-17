import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { todayISO } from "@/lib/date";
import { ErreurMetier } from "@/lib/resultat";
import { ENTETES_JOURNAL, lireJournalPassages, periodeValide } from "@/lib/export";
import { getEquipe, isIsabelleAdmin } from "@/lib/team";
import { PrintButton } from "@/components/account/PrintButton";

const LIGNES_APERCU = 3000;

export default async function ExportPage({
  searchParams,
}: {
  searchParams: { du?: string; au?: string; soignante?: string };
}) {
  const current = await getCurrentSoignante();
  const admin = isIsabelleAdmin(current);
  const aujourdhui = todayISO();
  const du = searchParams.du ?? `${aujourdhui.slice(0, 8)}01`;
  const au = searchParams.au ?? aujourdhui;
  const soignanteId = admin ? searchParams.soignante || "" : current.id;
  const equipe = admin ? await getEquipe(current.id) : [];

  let journal: Awaited<ReturnType<typeof lireJournalPassages>> | null = null;
  let erreur: string | null = null;
  if (searchParams.du && searchParams.au) {
    try {
      const periode = periodeValide(du, au);
      journal = await lireJournalPassages(current, {
        ...periode,
        soignanteId: soignanteId || null,
        limite: LIGNES_APERCU,
      });
    } catch (e) {
      if (!(e instanceof ErreurMetier)) throw e;
      erreur = e.message;
    }
  }

  const query = new URLSearchParams({ du, au, ...(soignanteId ? { soignante: soignanteId } : {}) });

  return (
    <div className="px-4 pb-24 pt-4 safe-top print:px-0 print:pt-0">
      <Link
        href="/compte"
        className="mb-4 flex items-center gap-1 text-sm text-pine/60 print:hidden"
      >
        <ChevronLeft size={18} /> Retour
      </Link>

      <h1 className="mb-1 font-serif text-2xl font-semibold text-pine">Journal des passages</h1>
      <p className="mb-4 text-sm text-pine/55 print:hidden">
        {admin
          ? "Export de l'agenda et des actes, pour toute l'équipe ou une soignante."
          : "Export de vos propres passages et actes."}
      </p>

      <form
        method="get"
        className="mb-4 flex flex-col gap-3 rounded-[24px] border border-line/80 bg-card p-4 shadow-card print:hidden"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Du</span>
            <input
              type="date"
              name="du"
              defaultValue={du}
              required
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Au</span>
            <input
              type="date"
              name="au"
              defaultValue={au}
              required
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        {admin && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Soignante</span>
            <select
              name="soignante"
              defaultValue={soignanteId}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="">Toute l&apos;équipe</option>
              {equipe.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.prenom} {s.nom}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="submit"
          className="rounded-xl bg-pine py-2.5 text-sm font-semibold text-cream"
        >
          Afficher
        </button>
      </form>

      {erreur && (
        <p role="alert" className="mb-4 rounded-xl bg-statut-absent/10 px-3 py-2 text-sm text-statut-absent">
          {erreur}
        </p>
      )}

      {journal && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-pine/70">
              {journal.lignes.length} passage{journal.lignes.length > 1 ? "s" : ""}
              {journal.tronque ? ` (aperçu limité à ${LIGNES_APERCU} — le CSV est complet)` : ""}
            </p>
            <div className="flex gap-2">
              <a
                href={`/api/export/passages?${query.toString()}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3.5 py-2 text-sm font-semibold text-white"
              >
                <Download size={15} /> CSV
              </a>
              <PrintButton />
            </div>
          </div>

          <p className="mb-2 hidden text-sm print:block">
            Passages du {du} au {au}
            {soignanteId && admin
              ? ` — ${equipe.find((s) => s.id === soignanteId)?.prenom ?? ""}`
              : !admin
                ? ` — ${current.prenom} ${current.nom}`
                : ""}
          </p>

          <div className="overflow-x-auto rounded-2xl border border-line/70 bg-card print:border-0">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-pine/5 text-pine/70">
                <tr>
                  {ENTETES_JOURNAL.map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journal.lignes.map((l, i) => (
                  <tr key={i} className="border-t border-line/60 break-inside-avoid">
                    <td className="whitespace-nowrap px-3 py-1.5">{l.date}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{l.tranche}</td>
                    <td className="px-3 py-1.5">{l.patient}</td>
                    <td className="px-3 py-1.5">{l.soignante}</td>
                    <td className="px-3 py-1.5">{l.actes}</td>
                    <td className="px-3 py-1.5">{l.statut}</td>
                    <td className="px-3 py-1.5">{l.heureReelle}</td>
                  </tr>
                ))}
                {journal.lignes.length === 0 && (
                  <tr>
                    <td colSpan={ENTETES_JOURNAL.length} className="px-3 py-4 text-center text-pine/45">
                      Aucun passage sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-pine/45 print:hidden">
            Pour un PDF : « PDF / Imprimer », puis « Enregistrer au format PDF » dans la fenêtre
            d&apos;impression.
          </p>
        </>
      )}
    </div>
  );
}
