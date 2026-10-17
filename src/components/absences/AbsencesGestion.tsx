"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { declarerAbsenceAction, supprimerAbsenceAction } from "@/app/(app)/actions";
import type { AbsenceLigne } from "@/lib/absences";

const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
}

export function AbsencesGestion({
  absences,
  moiId,
  admin,
  equipe,
  aujourdhui,
}: {
  absences: AbsenceLigne[];
  moiId: string;
  admin: boolean;
  equipe: { id: string; prenom: string; nom: string }[];
  aujourdhui: string;
}) {
  const router = useRouter();
  const [soignanteId, setSoignanteId] = useState(moiId);
  const [dateDebut, setDateDebut] = useState(aujourdhui);
  const [dateFin, setDateFin] = useState(aujourdhui);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function declarer(event: React.FormEvent) {
    event.preventDefault();
    setErreur(null);
    setInfo(null);
    startTransition(async () => {
      const res = await declarerAbsenceAction({ soignanteId, dateDebut, dateFin, motif: motif || null });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      router.push(`/compte/absences/${res.data.id}/repartir`);
    });
  }

  function supprimer(a: AbsenceLigne) {
    setErreur(null);
    startTransition(async () => {
      const res = await supprimerAbsenceAction(a.id);
      if (!res.ok) setErreur(res.error);
      else setInfo("Absence supprimée. Les visites déjà confiées à une collègue ne reviennent pas automatiquement.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={declarer} className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">Déclarer une absence</h2>
        <div className="grid gap-3">
          {admin && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-pine/80">Soignante</span>
              <select value={soignanteId} onChange={(e) => setSoignanteId(e.target.value)} className={inputClass}>
                {equipe.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.prenom} {s.nom}
                    {s.id === moiId ? " (moi)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-pine/80">Du</span>
              <input
                type="date"
                required
                min={aujourdhui}
                value={dateDebut}
                onChange={(e) => {
                  setDateDebut(e.target.value);
                  if (dateFin < e.target.value) setDateFin(e.target.value);
                }}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-pine/80">Au (inclus)</span>
              <input type="date" required min={dateDebut} value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Motif (facultatif)</span>
            <input
              value={motif}
              maxLength={100}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Congés, formation…"
              className={inputClass}
            />
            <span className="text-xs text-pine/45">Visible de toute l&apos;équipe : aucune information médicale.</span>
          </label>
        </div>
        {erreur && <p role="alert" className="mt-3 text-sm text-coral">{erreur}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          Déclarer et répartir les visites
        </button>
      </form>

      {info && <p role="status" className="rounded-xl bg-statut-faite/10 px-3 py-2 text-sm text-statut-faite">{info}</p>}

      <section className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">En cours et à venir</h2>
        {absences.length === 0 ? (
          <p className="text-sm text-pine/45">Aucune absence déclarée.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {absences.map((a) => {
              const gerable = a.soignanteId === moiId || admin;
              return (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line/70 bg-cream px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.soignanteCouleur }} aria-hidden />
                      {a.soignantePrenom} {a.soignanteNom}
                    </p>
                    <p className="mt-0.5 text-xs text-pine/60">
                      Du {formatDate(a.dateDebut)} au {formatDate(a.dateFin)}
                      {a.motif ? ` · ${a.motif}` : ""}
                    </p>
                    {a.aRepartir > 0 && gerable && (
                      <Link
                        href={`/compte/absences/${a.id}/repartir`}
                        className="mt-1 inline-block text-xs font-semibold text-coral underline underline-offset-2"
                      >
                        {a.aRepartir} visite{a.aRepartir > 1 ? "s" : ""} à répartir
                      </Link>
                    )}
                  </div>
                  {gerable && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => supprimer(a)}
                      aria-label="Supprimer cette absence"
                      className="shrink-0 rounded-full p-2 text-pine/40 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
