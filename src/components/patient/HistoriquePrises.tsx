"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { corrigerPriseAction } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { PriseHistorique } from "@/lib/prises";
import { COMMENTAIRE_PRISE_MAX, LIBELLES_PRISE, STATUTS_PRISE, type StatutPriseCalc } from "@/lib/prises-calc";
import { libelleTranche, estTranche } from "@/lib/tranches";

const COULEUR: Record<StatutPriseCalc, string> = {
  administre: "bg-statut-faite/10 text-statut-faite",
  refuse: "bg-statut-absent/10 text-statut-absent",
  non_administre: "bg-statut-reportee/10 text-statut-reportee",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

/** Historique des prises de traitement du patient ; une prise se corrige (la correction est tracée). */
export function HistoriquePrises({ prises, patientId }: { prises: PriseHistorique[]; patientId: string }) {
  const router = useRouter();
  const [cible, setCible] = useState<PriseHistorique | null>(null);
  const [statut, setStatut] = useState<StatutPriseCalc>("administre");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (prises.length === 0) return null;

  function ouvrir(p: PriseHistorique) {
    setCible(p);
    setStatut(p.statut);
    setCommentaire(p.commentaire ?? "");
    setErreur(null);
  }

  function enregistrer() {
    if (!cible) return;
    setErreur(null);
    startTransition(async () => {
      const res = await corrigerPriseAction({
        priseId: cible.id,
        statut,
        commentaire: statut === "administre" ? null : commentaire || null,
        patientId,
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setCible(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-5 border-t border-line/70 pt-4">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <History size={16} />
        <h3 className="font-serif text-lg font-semibold">Historique des prises</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {prises.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line/70 bg-cream px-3.5 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {p.traitement}
                  {p.dosage ? <span className="font-normal text-pine/55"> · {p.dosage}</span> : null}
                </p>
                <p className="text-xs text-pine/55">
                  {formatDate(p.date)}
                  {estTranche(p.tranche) ? ` · ${libelleTranche(p.tranche)}` : ""}
                  {p.soignantePrenom ? ` · ${p.soignantePrenom}` : ""}
                  {p.corrections > 0 ? ` · corrigée ${p.corrections} fois` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${COULEUR[p.statut]}`}>
                {LIBELLES_PRISE[p.statut]}
              </span>
            </div>
            {p.commentaire && <p className="mt-1 text-sm text-pine/70">« {p.commentaire} »</p>}
            <button type="button" onClick={() => ouvrir(p)} className="mt-1.5 text-xs font-semibold text-coral">
              Corriger
            </button>
          </li>
        ))}
      </ul>

      <BottomSheet open={cible !== null} onClose={() => setCible(null)} title={cible?.traitement}>
        <div className="flex flex-col gap-4 pb-2">
          <p className="rounded-xl bg-pine/5 px-3 py-2 text-sm text-pine/80">
            La correction est enregistrée dans l&apos;historique (qui, quand, avant / après).
          </p>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Statut de la prise">
            {STATUTS_PRISE.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statut === s}
                onClick={() => setStatut(s)}
                className={`min-h-11 rounded-xl border px-1 text-xs font-semibold ${
                  statut === s ? "border-pine bg-pine text-cream" : "border-line text-pine/70"
                }`}
              >
                {LIBELLES_PRISE[s]}
              </button>
            ))}
          </div>
          {statut !== "administre" && (
            <input
              value={commentaire}
              maxLength={COMMENTAIRE_PRISE_MAX}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Commentaire (facultatif)"
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-coral"
            />
          )}
          {erreur && <p role="alert" className="text-sm text-statut-absent">{erreur}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={enregistrer}
            className="rounded-xl bg-coral py-3 text-base font-medium text-white disabled:opacity-60"
          >
            Enregistrer la correction
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
