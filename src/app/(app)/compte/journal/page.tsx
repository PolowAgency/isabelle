import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { lireJournalAudit } from "@/lib/audit-lecture";
import { libelleAction } from "@/lib/audit-labels";
import { ajouterJours, estDateISOValide, todayISO } from "@/lib/date";
import { getEquipe, isAdmin } from "@/lib/team";

const formatHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function JournalActivitePage({
  searchParams,
}: {
  searchParams: { du?: string; au?: string; soignante?: string; patient?: string };
}) {
  const current = await getCurrentSoignante();
  if (!isAdmin(current)) redirect("/compte");

  const aujourdhui = todayISO();
  const au = estDateISOValide(searchParams.au) ? searchParams.au : aujourdhui;
  const du = estDateISOValide(searchParams.du) ? searchParams.du : ajouterJours(au, -7);
  const soignanteId = searchParams.soignante || "";
  const patient = (searchParams.patient ?? "").slice(0, 100);

  const [equipe, journal] = await Promise.all([
    getEquipe(current.id),
    lireJournalAudit(current.id, { du, au, soignanteId: soignanteId || null, patient: patient || null }),
  ]);

  return (
    <div className="px-4 pb-24 pt-4 safe-top">
      <Link href="/compte" className="mb-4 flex items-center gap-1 text-sm text-pine/60">
        <ChevronLeft size={18} /> Retour
      </Link>
      <h1 className="mb-1 font-serif text-2xl font-semibold text-pine">Journal d&apos;activité</h1>
      <p className="mb-4 text-sm text-pine/55">
        Qui a consulté ou modifié quoi, et quand. Aucun contenu médical n&apos;y figure.
      </p>

      <form
        method="get"
        className="mb-4 flex flex-col gap-3 rounded-[24px] border border-line/80 bg-card p-4 shadow-card"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Du</span>
            <input type="date" name="du" defaultValue={du} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Au</span>
            <input type="date" name="au" defaultValue={au} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-pine/60">Soignante</span>
          <select name="soignante" defaultValue={soignanteId} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Toutes</option>
            {equipe.map((s) => (
              <option key={s.id} value={s.id}>
                {s.prenom} {s.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-pine/60">Patient (nom ou prénom)</span>
          <input name="patient" defaultValue={patient} maxLength={100} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-xl bg-pine py-2.5 text-sm font-semibold text-cream">
          Filtrer
        </button>
      </form>

      <p className="mb-2 text-sm text-pine/70">
        {journal.lignes.length} événement{journal.lignes.length > 1 ? "s" : ""}
        {journal.tronque ? " (500 derniers affichés — affinez les filtres)" : ""}
      </p>
      <div className="flex flex-col gap-2">
        {journal.lignes.map((l) => (
          <div key={l.id} className="rounded-2xl border border-line/70 bg-card px-4 py-3">
            <p className="text-sm font-semibold text-ink">{libelleAction(l.action)}</p>
            <p className="text-xs text-pine/60">
              {l.soignante ?? "Inconnue / non connectée"}
              {l.patient ? ` · ${l.patient}` : ""}
            </p>
            <p className="text-xs text-pine/45">{formatHeure.format(new Date(l.createdAt))}</p>
          </div>
        ))}
        {journal.lignes.length === 0 && <p className="text-sm text-pine/45">Aucun événement sur cette période.</p>}
      </div>
    </div>
  );
}
