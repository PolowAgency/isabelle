"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  COMMENTAIRE_PRISE_MAX,
  LIBELLES_PRISE,
  STATUTS_PRISE,
  type PriseSaisie,
  type StatutPriseCalc,
  type TraitementDu,
} from "@/lib/prises-calc";

const COULEURS: Record<StatutPriseCalc, { actif: string; repos: string }> = {
  administre: { actif: "bg-statut-faite text-white border-statut-faite", repos: "border-line text-pine/70" },
  refuse: { actif: "bg-statut-absent text-white border-statut-absent", repos: "border-line text-pine/70" },
  non_administre: { actif: "bg-statut-reportee text-white border-statut-reportee", repos: "border-line text-pine/70" },
};

/**
 * Traitements prévus à ce passage : « administré », « refusé » ou « non administré » pour chacun,
 * commentaire facultatif quand ce n'est pas administré. Sert à la tournée et au mode hors-ligne.
 * `onConfirmer` renvoie un message d'erreur, ou null si c'est enregistré.
 */
export function TraitementsSheet({
  titre,
  traitements,
  initiales = [],
  onClose,
  onConfirmer,
}: {
  /** null = fermée. */
  titre: string | null;
  traitements: TraitementDu[];
  initiales?: PriseSaisie[];
  onClose: () => void;
  onConfirmer: (prises: PriseSaisie[]) => Promise<string | null> | string | null;
}) {
  const [choix, setChoix] = useState<Record<string, { statut: StatutPriseCalc; commentaire: string }>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (titre === null) return;
    setChoix(
      Object.fromEntries(initiales.map((p) => [p.traitementId, { statut: p.statut, commentaire: p.commentaire ?? "" }]))
    );
    setErreur(null);
    setEnCours(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titre]);

  const repondus = traitements.filter((t) => choix[t.id]).length;
  const complet = repondus === traitements.length;

  async function confirmer() {
    setErreur(null);
    setEnCours(true);
    const prises: PriseSaisie[] = traitements.map((t) => ({
      traitementId: t.id,
      statut: choix[t.id].statut,
      commentaire: choix[t.id].statut === "administre" ? null : choix[t.id].commentaire.trim() || null,
    }));
    const message = await onConfirmer(prises);
    setEnCours(false);
    if (message) setErreur(message);
  }

  return (
    <BottomSheet open={titre !== null} onClose={onClose} title={titre ?? undefined}>
      <div className="flex flex-col gap-4 pb-2">
        <p className="rounded-xl bg-pine/5 px-3 py-2 text-sm text-pine/80">
          Traitements prévus à ce passage : indiquez pour chacun s&apos;il a été administré.
        </p>

        <button
          type="button"
          onClick={() =>
            setChoix(Object.fromEntries(traitements.map((t) => [t.id, { statut: "administre" as const, commentaire: "" }])))
          }
          className="self-start rounded-full border border-statut-faite/40 px-3 py-1.5 text-xs font-semibold text-statut-faite"
        >
          Tout marquer « administré »
        </button>

        <ul className="flex flex-col gap-3">
          {traitements.map((t) => {
            const actuel = choix[t.id];
            return (
              <li key={t.id} className="rounded-2xl border border-line bg-cream px-3.5 py-3">
                <p className="text-sm font-semibold text-ink">
                  {t.libelle}
                  {t.dosage ? <span className="font-normal text-pine/60"> · {t.dosage}</span> : null}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label={`Prise de ${t.libelle}`}>
                  {STATUTS_PRISE.map((statut) => {
                    const actif = actuel?.statut === statut;
                    return (
                      <button
                        key={statut}
                        type="button"
                        aria-pressed={actif}
                        onClick={() =>
                          setChoix((c) => ({ ...c, [t.id]: { statut, commentaire: c[t.id]?.commentaire ?? "" } }))
                        }
                        className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border px-1 text-xs font-semibold ${
                          actif ? COULEURS[statut].actif : COULEURS[statut].repos
                        }`}
                      >
                        {actif && <Check size={13} />}
                        {LIBELLES_PRISE[statut]}
                      </button>
                    );
                  })}
                </div>
                {actuel && actuel.statut !== "administre" && (
                  <input
                    value={actuel.commentaire}
                    maxLength={COMMENTAIRE_PRISE_MAX}
                    onChange={(e) => setChoix((c) => ({ ...c, [t.id]: { ...c[t.id], commentaire: e.target.value } }))}
                    placeholder="Commentaire (facultatif)"
                    aria-label={`Commentaire pour ${t.libelle}`}
                    className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-coral"
                  />
                )}
              </li>
            );
          })}
        </ul>

        {erreur && (
          <p role="alert" className="text-sm text-statut-absent">
            {erreur}
          </p>
        )}

        <button
          type="button"
          disabled={!complet || enCours}
          onClick={() => void confirmer()}
          className="rounded-xl bg-statut-faite py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {complet ? "Valider la visite" : `Encore ${traitements.length - repondus} traitement${traitements.length - repondus > 1 ? "s" : ""} à renseigner`}
        </button>
      </div>
    </BottomSheet>
  );
}
