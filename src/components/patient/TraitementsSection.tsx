import { Pill } from "lucide-react";
import type { PatientTreatment } from "@/lib/patient-detail";

const PASSAGES: Record<string, string> = {
  matin: "Matin",
  midi: "Midi",
  soir: "Soir",
};

export function TraitementsSection({
  traitements,
}: {
  traitements: PatientTreatment[];
}) {
  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <Pill size={18} />
        <h2 className="font-serif text-xl font-semibold">Traitements en cours</h2>
      </div>

      {traitements.length === 0 ? (
        <p className="text-sm text-pine/45">Aucun traitement actif pour le moment.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {traitements.map((traitement) => (
            <div
              key={traitement.id}
              className="rounded-2xl border border-line/70 bg-cream px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold text-ink">
                  {traitement.libelle}
                  {traitement.dosage ? ` - ${traitement.dosage}` : ""}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {traitement.passages.map((passage) => (
                    <span
                      key={passage}
                      className="rounded-full bg-pine px-2.5 py-1 text-xs font-semibold text-cream"
                    >
                      {PASSAGES[passage] ?? passage}
                    </span>
                  ))}
                </div>
              </div>

              {traitement.notes ? (
                <p className="mt-2 text-sm leading-6 text-pine/65">{traitement.notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
