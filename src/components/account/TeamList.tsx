import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getDisplayName, getInitiales } from "@/lib/team-format";
import type { PublicSoignante } from "@/lib/schema";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`)
  );
}

export function TeamList({
  equipe,
  canManage = false,
}: {
  equipe: PublicSoignante[];
  canManage?: boolean;
}) {
  const titulaires = equipe.filter((soignante) => soignante.role === "titulaire");
  const remplacantes = equipe.filter(
    (soignante) => soignante.role === "remplacante" && soignante.actif
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine/35">
          Titulaires
        </p>
        <div className="flex flex-col gap-2">
          {titulaires.map((soignante) => (
            <div
              key={soignante.id}
              className="flex items-center gap-3 rounded-2xl border border-line/70 bg-cream px-3 py-3"
            >
              <Avatar
                initiales={getInitiales(soignante.prenom, soignante.nom)}
                couleur={soignante.couleur}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {getDisplayName(soignante)}
                </p>
                <p className="text-xs text-pine/55">{soignante.email}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine/35">
          Remplaçantes actives
        </p>

        {remplacantes.length === 0 ? (
          <p className="text-sm text-pine/45">Aucune remplacante active en ce moment.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {remplacantes.map((soignante) => (
              <div
                key={soignante.id}
                className="rounded-2xl border border-line/70 bg-cream px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    initiales={getInitiales(soignante.prenom, soignante.nom)}
                    couleur={soignante.couleur}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {getDisplayName(soignante)}
                      </p>
                      <span className="rounded-full bg-coral/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coral">
                        Rempl.
                      </span>
                    </div>
                    <p className="text-xs text-pine/55">{soignante.email}</p>
                    <p className="mt-1 text-xs text-pine/45">
                      {formatDate(soignante.dateDebut)
                        ? `Du ${formatDate(soignante.dateDebut)}`
                        : "Debut non renseigné"}
                      {soignante.dateFin ? ` au ${formatDate(soignante.dateFin)}` : ""}
                    </p>

                    {canManage ? (
                      <Link
                        href={`/compte/remplacantes/${soignante.id}`}
                        className="mt-2 inline-flex rounded-full bg-pine px-2.5 py-1 text-[11px] font-semibold text-cream"
                      >
                        Modifier
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
