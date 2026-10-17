"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MESSAGE_ACTE_REQUIS } from "@/lib/actes";
import type { VisiteLigne } from "@/lib/tournee";
import { ActesPicker } from "./ActesPicker";

/**
 * Ouverte quand on veut valider une visite qui n'a encore aucun acte :
 * on choisit les actes réalisés, puis la visite est validée en une fois.
 */
export function ActesRequisSheet({
  visite,
  onClose,
  onValider,
}: {
  visite: VisiteLigne | null;
  onClose: () => void;
  /** Renvoie un message d'erreur à afficher, ou null si la validation a réussi. */
  onValider: (visite: VisiteLigne, actes: string[]) => Promise<string | null>;
}) {
  const [actes, setActes] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setActes([]);
    setErreur(null);
    setEnvoi(false);
  }, [visite]);

  async function valider() {
    if (!visite || actes.length === 0) return;
    setEnvoi(true);
    setErreur(await onValider(visite, actes));
    setEnvoi(false);
  }

  return (
    <BottomSheet
      open={visite !== null}
      onClose={onClose}
      title={visite ? `${visite.patientPrenom} ${visite.patientNom}` : undefined}
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
          {MESSAGE_ACTE_REQUIS} Quels actes avez-vous réalisés ?
        </p>
        <ActesPicker value={actes} onChange={setActes} />
        {erreur && (
          <p role="alert" className="text-sm text-statut-absent">
            {erreur}
          </p>
        )}
        <button
          onClick={valider}
          disabled={envoi || actes.length === 0}
          className="bg-statut-faite text-white font-medium rounded-xl py-3 text-base disabled:opacity-50"
        >
          {envoi ? "Validation…" : "Valider la visite"}
        </button>
      </div>
    </BottomSheet>
  );
}
