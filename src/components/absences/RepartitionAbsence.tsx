"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LoaderCircle, Sparkles } from "lucide-react";
import { repartirAbsenceAction } from "@/app/(app)/actions";
import type { DonneesRepartition } from "@/lib/absences";
import { formaterDuree, dureeDeLaVisite } from "@/lib/planning-calc";
import { apercuRepartition, proposerRepartition, type GroupePatient } from "@/lib/repartition";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
}

const NON_ATTRIBUE = "";

export function RepartitionAbsence({
  donnees,
  durees,
  capaciteMin,
}: {
  donnees: DonneesRepartition;
  durees: Record<string, number>;
  capaciteMin: number;
}) {
  const router = useRouter();
  const { absence, periode, visites, collegues } = donnees;

  const groupes = useMemo(() => {
    const parPatient = new Map<string, { patientId: string; nom: string; visites: DonneesRepartition["visites"] }>();
    for (const v of visites) {
      const g = parPatient.get(v.patientId) ?? { patientId: v.patientId, nom: `${v.patientPrenom} ${v.patientNom}`, visites: [] };
      parPatient.set(v.patientId, { ...g, visites: [...g.visites, v] });
    }
    return Array.from(parPatient.values());
  }, [visites]);

  const groupesCalcul = useMemo<GroupePatient[]>(
    () => groupes.map((g) => ({ patientId: g.patientId, visites: g.visites })),
    [groupes]
  );
  const colleguesCalcul = useMemo(
    () => collegues.map((c) => ({ id: c.id, visites: c.visites, joursAbsente: new Set(c.joursAbsente) })),
    [collegues]
  );

  const [affectation, setAffectation] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apercu = useMemo(
    () => apercuRepartition(groupesCalcul, colleguesCalcul, affectation, durees, capaciteMin),
    [groupesCalcul, colleguesCalcul, affectation, durees, capaciteMin]
  );
  const attribues = groupes.filter((g) => affectation[g.patientId]);
  const nbVisitesAttribuees = attribues.reduce((n, g) => n + g.visites.length, 0);

  function toutConfierA(id: string) {
    setAffectation(Object.fromEntries(groupes.map((g) => [g.patientId, id])));
  }

  function envoyer() {
    setErreur(null);
    startTransition(async () => {
      const res = await repartirAbsenceAction({
        absenceId: absence.id,
        affectations: attribues.map((g) => ({ patientId: g.patientId, versSoignanteId: affectation[g.patientId] })),
        message: message || null,
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      router.push(`/alertes`);
      router.refresh();
    });
  }

  if (visites.length === 0) {
    return (
      <p className="rounded-2xl border border-line/80 bg-card p-5 text-sm text-pine/70">
        {absence.soignantePrenom} n&apos;a aucune visite prévue du {formatDate(periode.debut)} au {formatDate(periode.fin)} :
        rien à répartir.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-pine/60">
        {visites.length} visite{visites.length > 1 ? "s" : ""} de {absence.soignantePrenom}, du {formatDate(periode.debut)}{" "}
        au {formatDate(periode.fin)}, pour {groupes.length} patient{groupes.length > 1 ? "s" : ""}. Chaque collègue
        reçoit une demande qu&apos;elle accepte ou refuse : rien ne change avant son accord.
      </p>

      {collegues.length === 0 ? (
        <p role="alert" className="rounded-2xl bg-statut-absent/10 px-4 py-3 text-sm text-statut-absent">
          Aucune collègue active à qui confier ces visites.
        </p>
      ) : (
        <>
          <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">Charge de chaque collègue</h2>
              <button
                type="button"
                onClick={() => setAffectation(proposerRepartition(groupesCalcul, colleguesCalcul, durees))}
                className="inline-flex items-center gap-1.5 rounded-full bg-pine px-3 py-1.5 text-xs font-semibold text-cream"
              >
                <Sparkles size={14} /> Répartir équitablement
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {collegues.map((c) => {
                const a = apercu.find((x) => x.collegueId === c.id)!;
                const aDepasse = a.depassementsApres > a.depassementsAvant;
                return (
                  <li key={c.id} className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.couleur }} aria-hidden />
                        {c.prenom} {c.nom}
                      </p>
                      <button type="button" onClick={() => toutConfierA(c.id)} className="text-xs font-semibold text-coral">
                        Tout lui confier
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-pine/65">
                      Avant : {a.nbAvant} visite{a.nbAvant > 1 ? "s" : ""} · {formaterDuree(a.minAvant)}
                    </p>
                    <p className={`text-xs ${a.nbApres !== a.nbAvant ? "font-semibold text-pine" : "text-pine/65"}`}>
                      Après : {a.nbApres} visite{a.nbApres > 1 ? "s" : ""} · {formaterDuree(a.minApres)}
                    </p>
                    {(aDepasse || a.surJoursAbsente > 0) && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-statut-absent">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>
                          {aDepasse &&
                            `${a.depassementsApres} tranche${a.depassementsApres > 1 ? "s" : ""} au-dessus de ${formaterDuree(capaciteMin)}. `}
                          {a.surJoursAbsente > 0 &&
                            `${a.surJoursAbsente} visite${a.surJoursAbsente > 1 ? "s" : ""} un jour où elle est absente.`}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">Patients</h2>
            <ul className="flex flex-col gap-3">
              {groupes.map((g) => {
                const minutes = g.visites.reduce((n, v) => n + dureeDeLaVisite(v, durees), 0);
                return (
                  <li key={g.patientId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{g.nom}</p>
                      <p className="text-xs text-pine/55">
                        {g.visites.length} visite{g.visites.length > 1 ? "s" : ""} · {formaterDuree(minutes)}
                      </p>
                    </div>
                    <select
                      value={affectation[g.patientId] ?? NON_ATTRIBUE}
                      onChange={(e) => setAffectation((a) => ({ ...a, [g.patientId]: e.target.value }))}
                      aria-label={`Collègue pour ${g.nom}`}
                      className="h-11 w-40 shrink-0 rounded-xl border border-line bg-cream px-2 text-sm text-ink"
                    >
                      <option value={NON_ATTRIBUE}>Non confié</option>
                      {collegues.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.prenom}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </section>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Message pour vos collègues (facultatif)</span>
            <textarea
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="rounded-2xl border border-line bg-cream px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          </label>

          {erreur && <p role="alert" className="text-sm text-coral">{erreur}</p>}
        </>
      )}

      {collegues.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 pb-6 pt-3 backdrop-blur-sm">
          <button
            type="button"
            disabled={pending || attribues.length === 0}
            onClick={envoyer}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {attribues.length === 0
              ? "Choisissez une collègue"
              : `Envoyer ${attribues.length} demande${attribues.length > 1 ? "s" : ""} (${nbVisitesAttribuees} visite${nbVisitesAttribuees > 1 ? "s" : ""})`}
          </button>
        </div>
      )}
    </div>
  );
}
