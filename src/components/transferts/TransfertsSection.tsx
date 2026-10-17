"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { marquerReponseVueAction, repondreTransfertAction, repondreTransfertsAbsenceAction } from "@/app/(app)/actions";
import { libelleTranche, estTranche } from "@/lib/tranches";
import type { TransfertLigne, TransfertsPourAlertes } from "@/lib/transferts";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

function portee(t: TransfertLigne) {
  if (t.cible === "visite" && t.visiteDate) {
    const tranche = t.visiteTranche && estTranche(t.visiteTranche) ? ` · ${libelleTranche(t.visiteTranche)}` : "";
    return `Visite du ${formatDate(t.visiteDate)}${tranche}`;
  }
  if (t.cible === "serie" && t.serieDebut && t.serieFin) {
    return `Série du ${formatDate(t.serieDebut)} au ${formatDate(t.serieFin)} (visites à venir)`;
  }
  if (t.periodeDebut && t.periodeFin) {
    return `Visites du ${formatDate(t.periodeDebut)} au ${formatDate(t.periodeFin)}`;
  }
  return "Toutes les visites à venir";
}

type GroupeAbsence = { absenceId: string; de: string; debut: string | null; fin: string | null; lignes: TransfertLigne[] };

/** Demandes reçues qui viennent d'une même absence : regroupées pour être traitées en une fois. */
function grouperParAbsence(recus: TransfertLigne[]): { groupes: GroupeAbsence[]; seuls: TransfertLigne[] } {
  const groupes = new Map<string, GroupeAbsence>();
  const seuls: TransfertLigne[] = [];
  for (const t of recus) {
    if (!t.absenceId) {
      seuls.push(t);
      continue;
    }
    const g = groupes.get(t.absenceId) ?? {
      absenceId: t.absenceId,
      de: `${t.dePrenom} ${t.deNom}`,
      debut: t.periodeDebut,
      fin: t.periodeFin,
      lignes: [],
    };
    g.lignes.push(t);
    groupes.set(t.absenceId, g);
  }
  return { groupes: Array.from(groupes.values()), seuls };
}

export function TransfertsSection({ transferts }: { transferts: TransfertsPourAlertes }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function repondre(t: TransfertLigne, decision: "accepte" | "refuse") {
    setErreur(null);
    setInfo(null);
    startTransition(async () => {
      const res = await repondreTransfertAction(t.id, decision);
      if (!res.ok) {
        setErreur(res.error);
      } else if (decision === "accepte") {
        const n = res.data.deplacees;
        setInfo(`${n} visite${n > 1 ? "s" : ""} transférée${n > 1 ? "s" : ""} à votre nom.`);
      }
      router.refresh();
    });
  }

  function repondreEnLot(g: GroupeAbsence, decision: "accepte" | "refuse") {
    setErreur(null);
    setInfo(null);
    startTransition(async () => {
      const res = await repondreTransfertsAbsenceAction(g.absenceId, decision);
      if (!res.ok) {
        setErreur(res.error);
      } else if (decision === "accepte") {
        const n = res.data.deplacees;
        setInfo(`${n} visite${n > 1 ? "s" : ""} transférée${n > 1 ? "s" : ""} à votre nom.`);
      }
      router.refresh();
    });
  }

  function lu(t: TransfertLigne) {
    startTransition(async () => {
      await marquerReponseVueAction(t.id);
      router.refresh();
    });
  }

  const vide =
    transferts.recus.length === 0 && transferts.reponses.length === 0 && transferts.envoyes.length === 0;

  return (
    <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <ArrowRightLeft size={18} />
        <h2 className="font-serif text-xl font-semibold">Transferts</h2>
      </div>

      {info && (
        <p className="mb-3 rounded-xl bg-statut-faite/10 px-3 py-2 text-sm text-statut-faite">{info}</p>
      )}
      {erreur && (
        <p role="alert" className="mb-3 rounded-xl bg-statut-absent/10 px-3 py-2 text-sm text-statut-absent">
          {erreur}
        </p>
      )}

      {vide ? (
        <p className="text-sm text-pine/45">Aucun transfert en cours.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {grouperParAbsence(transferts.recus).groupes.map((g) => (
            <div key={g.absenceId} className="rounded-2xl border border-coral/30 bg-cream px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {g.de} s&apos;absente{g.debut && g.fin ? ` du ${formatDate(g.debut)} au ${formatDate(g.fin)}` : ""} et vous
                confie {g.lignes.length} patient{g.lignes.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs text-pine/55">Seules les visites de cette période vous seraient confiées.</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {g.lignes.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/patients/${t.patientId}`}
                      className="inline-block rounded-full bg-pine/5 px-2.5 py-1 text-xs font-medium text-pine"
                    >
                      {t.patientPrenom} {t.patientNom}
                    </Link>
                  </li>
                ))}
              </ul>
              {g.lignes[0]?.message && <p className="mt-2 text-sm text-pine/70">« {g.lignes[0].message} »</p>}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => repondreEnLot(g, "refuse")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium text-pine/70 disabled:opacity-60"
                >
                  <X size={16} /> Tout refuser
                </button>
                <button
                  disabled={pending}
                  onClick={() => repondreEnLot(g, "accepte")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-statut-faite py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Check size={16} /> Tout accepter
                </button>
              </div>
            </div>
          ))}

          {grouperParAbsence(transferts.recus).seuls.map((t) => (
            <div key={t.id} className="rounded-2xl border border-coral/30 bg-cream px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {t.dePrenom} {t.deNom} vous demande de reprendre{" "}
                <Link href={`/patients/${t.patientId}`} className="underline underline-offset-2">
                  {t.patientPrenom} {t.patientNom}
                </Link>
              </p>
              <p className="mt-1 text-xs text-pine/55">{portee(t)}</p>
              {t.message && <p className="mt-2 text-sm text-pine/70">« {t.message} »</p>}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => repondre(t, "refuse")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium text-pine/70 disabled:opacity-60"
                >
                  <X size={16} /> Refuser
                </button>
                <button
                  disabled={pending}
                  onClick={() => repondre(t, "accepte")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-statut-faite py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Check size={16} /> Accepter
                </button>
              </div>
            </div>
          ))}

          {transferts.reponses.map((t) => (
            <div key={t.id} className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {t.versPrenom} {t.versNom} a{" "}
                <span className={t.statut === "accepte" ? "text-statut-faite" : "text-statut-absent"}>
                  {t.statut === "accepte" ? "accepté" : "refusé"}
                </span>{" "}
                votre demande
              </p>
              <p className="mt-1 text-xs text-pine/55">
                {t.patientPrenom} {t.patientNom} · {portee(t)}
              </p>
              <button
                disabled={pending}
                onClick={() => lu(t)}
                className="mt-2 text-xs font-semibold text-coral disabled:opacity-60"
              >
                OK, c&apos;est noté
              </button>
            </div>
          ))}

          {transferts.envoyes.map((t) => (
            <div key={t.id} className="rounded-2xl border border-line/70 bg-cream/60 px-4 py-3">
              <p className="text-sm text-ink">
                En attente de {t.versPrenom} {t.versNom}
              </p>
              <p className="mt-1 text-xs text-pine/55">
                {t.patientPrenom} {t.patientNom} · {portee(t)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
