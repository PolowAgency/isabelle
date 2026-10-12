import { CalendarClock, FileText } from "lucide-react";
import type { PatientOrdonnance } from "@/lib/patient-detail";

function formatDate(value: string | null) {
  if (!value) return "Date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`)
  );
}

function badgeForStatus(statut: PatientOrdonnance["statut"]) {
  switch (statut) {
    case "expired":
      return "bg-[#c0503a] text-white";
    case "soon":
      return "bg-[#c9954a] text-white";
    case "ok":
      return "bg-[#4a8a6f] text-white";
    default:
      return "bg-pine/10 text-pine";
  }
}

function labelForStatus(statut: PatientOrdonnance["statut"]) {
  switch (statut) {
    case "expired":
      return "Expiree";
    case "soon":
      return "Moins de 30 j";
    case "ok":
      return "Valide";
    default:
      return "Sans echeance";
  }
}

export function OrdonnancesSection({
  ordonnances,
}: {
  ordonnances: PatientOrdonnance[];
}) {
  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <CalendarClock size={18} />
        <h2 className="font-serif text-xl font-semibold">Ordonnances</h2>
      </div>

      {ordonnances.length === 0 ? (
        <p className="text-sm text-pine/45">Aucune ordonnance enregistree.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ordonnances.map((ordonnance) => {
            const content = (
              <div className="flex items-start gap-3 rounded-2xl border border-line/70 bg-cream px-4 py-3">
                <FileText size={18} className="mt-0.5 shrink-0 text-pine/55" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {ordonnance.prescripteur ?? "Prescripteur non renseigné"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeForStatus(
                        ordonnance.statut
                      )}`}
                    >
                      {labelForStatus(ordonnance.statut)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-pine/65">
                    Fin de validite : {formatDate(ordonnance.dateFin)}
                  </p>
                  {ordonnance.description ? (
                    <p className="mt-2 text-sm leading-6 text-pine/70">
                      {ordonnance.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );

            return ordonnance.signedUrl ? (
              <a
                key={ordonnance.id}
                href={ordonnance.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {content}
              </a>
            ) : (
              <div key={ordonnance.id}>{content}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
