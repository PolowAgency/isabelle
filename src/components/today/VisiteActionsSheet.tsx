"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { annulerVisiteAction, modifierVisiteAction } from "@/app/(app)/actions";
import type { VisiteLigne } from "@/lib/tournee";
import type { PorteeModification } from "@/lib/series";
import { ActesPicker } from "./ActesPicker";

/** Modifier ou annuler une visite à venir — seule, ou avec les suivantes de sa série. */
export function VisiteActionsSheet({
  visite,
  onClose,
  onDone,
}: {
  visite: VisiteLigne | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [actes, setActes] = useState<string[]>([]);
  const [portee, setPortee] = useState<PorteeModification>("cette");
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setActes(visite?.actes ?? []);
    setPortee("cette");
    setConfirmerAnnulation(false);
    setErreur(null);
  }, [visite]);

  function executer(action: () => Promise<string>) {
    setErreur(null);
    startTransition(async () => {
      try {
        onDone(await action());
        router.refresh();
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "L'opération a échoué.");
      }
    });
  }

  const enSerie = Boolean(visite?.serieId);

  return (
    <BottomSheet
      open={visite !== null}
      onClose={onClose}
      title={visite ? `${visite.patientPrenom} ${visite.patientNom}` : undefined}
    >
      {visite && (
        <div className="flex flex-col gap-4 pb-2">
          {enSerie && (
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

          <div>
            <p className="text-sm font-medium text-pine/80 mb-1.5">Actes</p>
            <ActesPicker value={actes} onChange={setActes} />
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-statut-absent">
              {erreur}
            </p>
          )}

          <button
            disabled={pending}
            onClick={() =>
              executer(async () => {
                const res = await modifierVisiteAction({
                  visiteId: visite.id,
                  portee,
                  actes,
                  dureeEstimeeMin: actes.length > 0 ? actes.length * 15 : null,
                });
                return `${res.modifiees} visite${res.modifiees > 1 ? "s" : ""} modifiée${res.modifiees > 1 ? "s" : ""}.`;
              })
            }
            className="bg-coral text-white font-medium rounded-xl py-3 text-base disabled:opacity-60"
          >
            {pending ? "Enregistrement…" : "Enregistrer les actes"}
          </button>

          {confirmerAnnulation ? (
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
                  executer(async () => {
                    const res = await annulerVisiteAction(visite.id, portee);
                    return `${res.annulees} visite${res.annulees > 1 ? "s" : ""} annulée${res.annulees > 1 ? "s" : ""}.`;
                  })
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
          )}
        </div>
      )}
    </BottomSheet>
  );
}
