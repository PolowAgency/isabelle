import Link from "next/link";
import { CalendarOff } from "lucide-react";
import type { AbsenceLigne } from "@/lib/absences";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
}

/** Absences de l'équipe en cours ou à venir, avec le nombre de visites encore à répartir. */
export function AbsencesEquipeSection({
  absences,
  moiId,
  admin,
}: {
  absences: AbsenceLigne[];
  moiId: string;
  admin: boolean;
}) {
  if (absences.length === 0) return null;
  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <CalendarOff size={18} />
        <h2 className="font-serif text-xl font-semibold">Absences de l&apos;équipe</h2>
      </div>
      <ul className="flex flex-col gap-2">
        {absences.map((a) => {
          const peutRepartir = a.aRepartir > 0 && (a.soignanteId === moiId || admin);
          return (
            <li key={a.id} className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.soignanteCouleur }} aria-hidden />
                {a.soignantePrenom} {a.soignanteNom}
              </p>
              <p className="mt-0.5 text-xs text-pine/60">
                Du {formatDate(a.dateDebut)} au {formatDate(a.dateFin)}
                {a.motif ? ` · ${a.motif}` : ""}
              </p>
              {a.aRepartir > 0 && (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {a.aRepartir} visite{a.aRepartir > 1 ? "s" : ""} encore à son nom pendant l&apos;absence
                </p>
              )}
              {peutRepartir && (
                <Link
                  href={`/compte/absences/${a.id}/repartir`}
                  className="mt-2 inline-flex rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Répartir les visites
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
