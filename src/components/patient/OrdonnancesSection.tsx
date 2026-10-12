"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, FileText, Plus } from "lucide-react";
import { archiverOrdonnanceAction } from "@/app/(app)/actions";
import { AjouterOrdonnanceSheet } from "./AjouterOrdonnanceSheet";
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
      return "Expirée";
    case "soon":
      return "Moins de 30 j";
    case "ok":
      return "Valide";
    default:
      return "Sans échéance";
  }
}

export function OrdonnancesSection({
  ordonnances,
  patientId,
  storageConfigured,
}: {
  ordonnances: PatientOrdonnance[];
  patientId: string;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function archiver(id: string) {
    if (!window.confirm("Archiver cette ordonnance ? Elle ne sera plus affichée.")) return;
    startTransition(async () => {
      await archiverOrdonnanceAction(id, patientId);
      router.refresh();
    });
  }

  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-pine">
          <CalendarClock size={18} />
          <h2 className="font-serif text-xl font-semibold">Ordonnances</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-coral px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>
      <AjouterOrdonnanceSheet
        open={open}
        onClose={() => setOpen(false)}
        patientId={patientId}
        storageConfigured={storageConfigured}
      />

      {ordonnances.length === 0 ? (
        <p className="text-sm text-pine/45">Aucune ordonnance enregistrée.</p>
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
                    Fin de validité : {formatDate(ordonnance.dateFin)}
                  </p>
                  {ordonnance.description ? (
                    <p className="mt-2 text-sm leading-6 text-pine/70">
                      {ordonnance.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );

            return (
              <div key={ordonnance.id}>
                {ordonnance.signedUrl ? (
                  <a href={ordonnance.signedUrl} target="_blank" rel="noreferrer" className="block">
                    {content}
                  </a>
                ) : (
                  content
                )}
                <button
                  type="button"
                  onClick={() => archiver(ordonnance.id)}
                  className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-xs text-pine/45"
                >
                  <Archive size={13} /> Archiver
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
