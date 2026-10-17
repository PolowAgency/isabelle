"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { marquerReponseVueAction, repondreTransfertAction } from "@/app/(app)/actions";
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
  return "Toutes les visites à venir";
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
          {transferts.recus.map((t) => (
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
