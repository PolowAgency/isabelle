import { Avatar } from "@/components/ui/Avatar";
import type { PatientVisitHistory } from "@/lib/patient-detail";
import { libelleTranche } from "@/lib/tranches";

const STATUTS: Record<string, string> = {
  prevue: "Prevue",
  faite: "Faite",
  absent: "Absent",
  reportee: "Reportee",
  annulee: "Annulee",
};

const STATUT_CLASSES: Record<string, string> = {
  prevue: "bg-pine/10 text-pine",
  faite: "bg-[#4a8a6f] text-white",
  absent: "bg-[#c0503a] text-white",
  reportee: "bg-[#c9954a] text-white",
  annulee: "bg-pine/20 text-pine",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

export function HistoriqueSection({
  visites,
}: {
  visites: PatientVisitHistory[];
}) {
  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <h2 className="mb-3 font-serif text-xl font-semibold text-pine">
        Historique des visites
      </h2>

      {visites.length === 0 ? (
        <p className="text-sm text-pine/45">Aucune visite enregistree pour ce patient.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visites.map((visite) => (
            <div
              key={visite.id}
              className="rounded-2xl border border-line/70 bg-cream px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  initiales={`${visite.soignante.prenom[0] ?? ""}${visite.soignante.nom[0] ?? ""}`.toUpperCase()}
                  couleur={visite.soignante.couleur}
                  size={34}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {visite.soignante.prenom} {visite.soignante.nom}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        STATUT_CLASSES[visite.statut]
                      }`}
                    >
                      {STATUTS[visite.statut]}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-pine/60">
                    {formatDate(visite.date)} - {libelleTranche(visite.tranche)}
                  </p>

                  {visite.actes.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {visite.actes.map((acte) => (
                        <span
                          key={acte}
                          className="rounded-full bg-card px-2.5 py-1 text-xs font-medium text-pine/75"
                        >
                          {acte}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
