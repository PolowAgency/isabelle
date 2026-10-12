import Link from "next/link";
import { AlertCircle, ChevronRight, FileClock, MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { PatientListItemData } from "@/lib/patients";

function getInitiales(prenom: string, nom: string) {
  return `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
}

export function PatientListItem({ patient }: { patient: PatientListItemData }) {
  return (
    <Link
      href={`/patients/${patient.id}`}
      className="flex items-start gap-3 rounded-[22px] border border-line/80 bg-card p-3.5 shadow-card transition active:scale-[0.99]"
    >
      <Avatar initiales={getInitiales(patient.prenom, patient.nom)} couleur="#25453a" size={46} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold text-ink">
              {patient.prenom} {patient.nom}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: `${patient.secteurCouleur}33`,
                  color: "#25453a",
                }}
              >
                {patient.secteurNom}
              </span>
              {patient.ordonnanceAlerte ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2.5 py-1 text-xs font-semibold text-coral">
                  <FileClock size={12} />
                  Ordonnance
                </span>
              ) : null}
              {patient.transmissionNonLue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-pine/10 px-2.5 py-1 text-xs font-semibold text-pine">
                  <AlertCircle size={12} />
                  Transmission
                </span>
              ) : null}
            </div>
          </div>

          <ChevronRight size={18} className="mt-1 shrink-0 text-pine/35" />
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm text-pine/65">
          <MapPin size={14} className="shrink-0" />
          <p className="truncate">
            {[patient.adresse, patient.complementAdresse].filter(Boolean).join(", ") || "Adresse non renseignée"}
          </p>
        </div>

        <p className="mt-1 text-sm text-pine/45">
          {patient.ville ? `${patient.codePostal ?? ""} ${patient.ville}`.trim() : "Ville non renseignée"}
        </p>
      </div>
    </Link>
  );
}
