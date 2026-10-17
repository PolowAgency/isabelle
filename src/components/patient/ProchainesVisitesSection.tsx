import { CalendarClock, Repeat } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { libelleActe } from "@/lib/actes";
import { FREQUENCE_LABELS, JOURS_SEMAINE_LABELS } from "@/lib/recurrence";
import { libelleTranche } from "@/lib/tranches";
import type { PatientProchaineVisite, PatientSerie } from "@/lib/patient-detail";

function formatJour(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T00:00:00`)
  );
}

function descriptionSerie(serie: PatientSerie) {
  const jours =
    serie.joursSemaine.length > 0
      ? ` (${serie.joursSemaine.map((j) => JOURS_SEMAINE_LABELS[j - 1]).join(", ")})`
      : "";
  return `${FREQUENCE_LABELS[serie.frequence]}${jours} · ${serie.tranches.map(libelleTranche).join(" + ")}`;
}

const VISIBLES = 6;

/** Planning à venir : séries (soins récurrents) en cours puis prochaines visites. */
export function ProchainesVisitesSection({
  series,
  prochaines,
}: {
  series: PatientSerie[];
  prochaines: PatientProchaineVisite[];
}) {
  const debut = prochaines.slice(0, VISIBLES);
  const suite = prochaines.slice(VISIBLES);

  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <CalendarClock size={18} />
        <h2 className="font-serif text-xl font-semibold">Prochaines visites</h2>
      </div>

      {series.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {series.map((serie) => (
            <div key={serie.id} className="rounded-2xl border border-coral/25 bg-cream px-4 py-3">
              <div className="flex items-center gap-2 text-coral">
                <Repeat size={14} />
                <p className="text-xs font-semibold uppercase tracking-[0.12em]">Soin récurrent</p>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-ink">{descriptionSerie(serie)}</p>
              <p className="mt-1 text-xs text-pine/60">
                {serie.actes.map(libelleActe).join(" · ") || "Actes non renseignés"}
              </p>
              <p className="mt-1 text-xs text-pine/60">
                {serie.restantes} visite{serie.restantes > 1 ? "s" : ""} à venir
                {serie.prochaineDate ? ` · prochaine le ${formatJour(serie.prochaineDate)}` : ""}
                {" · jusqu'au "}
                {formatJour(serie.dateFin)}
              </p>
              <p className="mt-1 text-xs text-pine/45">
                {serie.soignante.prenom} {serie.soignante.nom}
              </p>
            </div>
          ))}
        </div>
      )}

      {prochaines.length === 0 ? (
        <p className="text-sm text-pine/45">Aucune visite prévue.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {debut.map((visite) => (
            <LigneVisite key={visite.id} visite={visite} />
          ))}
          {suite.length > 0 && (
            <details className="rounded-2xl border border-line/70 bg-cream/60 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-pine/50">
                Voir les {suite.length} suivantes
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {suite.map((visite) => (
                  <LigneVisite key={visite.id} visite={visite} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function LigneVisite({ visite }: { visite: PatientProchaineVisite }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line/70 bg-cream px-4 py-3">
      <Avatar
        initiales={`${visite.soignante.prenom[0] ?? ""}${visite.soignante.nom[0] ?? ""}`.toUpperCase()}
        couleur={visite.soignante.couleur}
        size={30}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold capitalize text-ink">
          {formatJour(visite.date)} · {libelleTranche(visite.tranche)}
        </p>
        <p className="text-xs text-pine/60">
          {visite.actes.map(libelleActe).join(" · ") || "Actes non renseignés"}
        </p>
        <p className="text-xs text-pine/45">{visite.soignante.prenom}</p>
      </div>
      {visite.serieId && <Repeat size={14} className="mt-1 shrink-0 text-coral" aria-label="Soin récurrent" />}
    </div>
  );
}
