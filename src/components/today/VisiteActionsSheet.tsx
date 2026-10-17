"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  annulerVisiteAction,
  corrigerActesAction,
  decalerVisiteAction,
  historiqueVisiteAction,
  modifierVisiteAction,
} from "@/app/(app)/actions";
import type { VisiteLigne } from "@/lib/tournee";
import type { PorteeModification } from "@/lib/series";
import type { Resultat } from "@/lib/resultat";
import type { EntreeHistoriqueLue } from "@/lib/visites";
import { MESSAGE_ACTE_REQUIS } from "@/lib/actes";
import type { Tranche } from "@/lib/tranches";
import { ActesPicker } from "./ActesPicker";
import { TranchesPicker } from "./TranchesPicker";

const CHAMPS: Record<string, string> = {
  statut: "Statut",
  actes: "Actes",
  tranche: "Tranche",
  date: "Date",
  soignante: "Soignante",
};

const STATUTS: Record<string, string> = {
  prevue: "prévue",
  faite: "faite",
  absent: "absente",
  reportee: "reportée",
  annulee: "annulée",
};

function valeur(champ: string, v: string | null) {
  if (v === null) return "—";
  return champ === "statut" ? (STATUTS[v] ?? v) : v;
}

function quand(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso)
  );
}

/**
 * Feuille d'une visite :
 * - à venir : modifier (actes, tranche) seule ou avec les suivantes d'une série, décaler à demain, annuler ;
 * - déjà validée : corriger les actes (ajout d'un acte oublié) ;
 * dans les deux cas, historique des modifications.
 */
export function VisiteActionsSheet({
  visite,
  onClose,
  onDone,
  onTransferer,
}: {
  visite: VisiteLigne | null;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Ouvre le transfert à une collègue (la feuille se ferme). */
  onTransferer: (visite: VisiteLigne) => void;
}) {
  const router = useRouter();
  const [actes, setActes] = useState<string[]>([]);
  const [tranche, setTranche] = useState<Tranche | null>(null);
  const [portee, setPortee] = useState<PorteeModification>("cette");
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [historique, setHistorique] = useState<EntreeHistoriqueLue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visiteId = visite?.id;
  useEffect(() => {
    setActes(visite?.actes ?? []);
    setTranche(visite?.tranche ?? null);
    setPortee("cette");
    setConfirmerAnnulation(false);
    setErreur(null);
    setHistorique(null);
    if (visiteId) {
      let annule = false;
      historiqueVisiteAction(visiteId)
        .then((rows) => !annule && setHistorique(rows))
        .catch(() => !annule && setHistorique([]));
      return () => {
        annule = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiteId]);

  function executer<T>(appel: () => Promise<Resultat<T>>, message: (donnees: T) => string) {
    setErreur(null);
    startTransition(async () => {
      const res = await appel();
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      onDone(message(res.data));
      router.refresh();
      onClose();
    });
  }

  const enSerie = Boolean(visite?.serieId);
  const validee = visite?.statut === "faite";
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  return (
    <BottomSheet
      open={visite !== null}
      onClose={onClose}
      title={visite ? `${visite.patientPrenom} ${visite.patientNom}` : undefined}
    >
      {visite && (
        <div className="flex flex-col gap-4 pb-2">
          {validee && (
            <p className="rounded-xl bg-statut-faite/10 px-3 py-2 text-sm text-statut-faite">
              Passage validé. Vous pouvez corriger les actes (par exemple ajouter un acte oublié) :
              la modification est enregistrée dans l&apos;historique.
            </p>
          )}

          {!validee && enSerie && (
            <div>
              <p className="text-sm font-medium text-pine/80 mb-1.5">Appliquer à</p>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    { value: "cette", label: "Cette visite seulement" },
                    { value: "suivantes", label: "Cette visite et les suivantes de la série" },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                      portee === o.value ? "border-pine bg-pine/5 text-pine" : "border-line text-pine/70"
                    }`}
                  >
                    <input
                      type="radio"
                      name="portee"
                      checked={portee === o.value}
                      onChange={() => setPortee(o.value)}
                      className="accent-[#25453a]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-pine/50">
                Les visites déjà faites, absentes ou reportées ne sont jamais modifiées.
              </p>
            </div>
          )}

          {!validee && (
            <div>
              <p className="text-sm font-medium text-pine/80 mb-1.5">Tranche horaire</p>
              <TranchesPicker value={tranche ? [tranche] : []} onChange={([t]) => setTranche(t)} />
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-pine/80 mb-1.5">Actes</p>
            <ActesPicker value={actes} onChange={setActes} />
            {validee && actes.length === 0 && (
              <p className="mt-1.5 text-xs text-statut-absent">{MESSAGE_ACTE_REQUIS}</p>
            )}
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-statut-absent">
              {erreur}
            </p>
          )}

          <button
            disabled={pending || (validee && actes.length === 0)}
            onClick={() =>
              validee
                ? executer(
                    () => corrigerActesAction(visite.id, actes),
                    () => "Actes corrigés."
                  )
                : executer(
                    () =>
                      modifierVisiteAction({
                        visiteId: visite.id,
                        portee,
                        actes,
                        dureeEstimeeMin: actes.length > 0 ? actes.length * 15 : null,
                        tranche: tranche ?? undefined,
                      }),
                    (res) =>
                      `${pluriel(res.modifiees, "visite")} modifiée${res.modifiees > 1 ? "s" : ""}` +
                      (res.ignorees > 0
                        ? ` · ${res.ignorees} non déplacée${res.ignorees > 1 ? "s" : ""} (tranche déjà occupée)`
                        : ".")
                  )
            }
            className="bg-coral text-white font-medium rounded-xl py-3 text-base disabled:opacity-60"
          >
            {pending ? "Enregistrement…" : validee ? "Enregistrer la correction" : "Enregistrer"}
          </button>

          {!validee && (
            <button
              disabled={pending}
              onClick={() =>
                executer(
                  () => decalerVisiteAction(visite.id),
                  (res) =>
                    res.creee
                      ? "Visite reportée à demain (même tranche)."
                      : "Visite reportée : une visite existait déjà demain sur cette tranche."
                )
              }
              className="rounded-xl border border-statut-reportee/50 py-3 text-sm font-medium text-statut-reportee disabled:opacity-60"
            >
              Décaler à demain
            </button>
          )}

          {!validee && (
            <button
              disabled={pending}
              onClick={() => onTransferer(visite)}
              className="rounded-xl border border-line py-3 text-sm font-medium text-pine disabled:opacity-60"
            >
              Transférer à une collègue
            </button>
          )}

          {!validee &&
            (confirmerAnnulation ? (
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => setConfirmerAnnulation(false)}
                  className="flex-1 rounded-xl border border-line py-3 text-sm font-medium text-pine/70"
                >
                  Garder
                </button>
                <button
                  disabled={pending}
                  onClick={() =>
                    executer(
                      () => annulerVisiteAction(visite.id, portee),
                      (res) => `${pluriel(res.annulees, "visite")} annulée${res.annulees > 1 ? "s" : ""}.`
                    )
                  }
                  className="flex-1 rounded-xl bg-statut-absent py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  Confirmer l&apos;annulation
                </button>
              </div>
            ) : (
              <button
                disabled={pending}
                onClick={() => setConfirmerAnnulation(true)}
                className="rounded-xl border border-statut-absent/40 py-3 text-sm font-medium text-statut-absent"
              >
                {enSerie && portee === "suivantes" ? "Annuler les visites" : "Annuler la visite"}
              </button>
            ))}

          {historique && historique.length > 0 && (
            <details className="rounded-xl border border-line/70 bg-cream/60 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-pine/50">
                Historique ({historique.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {historique.map((h) => (
                  <li key={h.id} className="text-xs text-pine/70">
                    <span className="font-semibold text-ink">{CHAMPS[h.champ] ?? h.champ}</span> :{" "}
                    {valeur(h.champ, h.ancienneValeur)} → {valeur(h.champ, h.nouvelleValeur)}
                    <br />
                    <span className="text-pine/45">
                      {h.soignantePrenom ?? "—"} · {quand(h.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
