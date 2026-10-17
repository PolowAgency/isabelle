"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  rechercherPatientsAction,
  creerVisiteAction,
  creerSerieVisitesAction,
  type PatientRecherche,
} from "@/app/(app)/actions";
import type { Tranche } from "@/lib/tranches";
import { ActesPicker } from "./ActesPicker";
import { TranchesPicker } from "./TranchesPicker";
import { DureeField } from "./DureeField";
import { dureeDeActes } from "@/lib/planning-calc";
import {
  RepeterSection,
  calculerDates,
  repetitionInitiale,
  type RepetitionState,
} from "./RepeterSection";

export function NouvelleVisiteSheet({
  open,
  onClose,
  date,
  defaultTranche,
  onCree,
  durees,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  defaultTranche: Tranche;
  /** Message de confirmation à afficher (snackbar) une fois la création terminée. */
  onCree?: (message: string) => void;
  /** Durée (min) de chaque acte, réglages de l'équipe. */
  durees: Record<string, number>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientRecherche[]>([]);
  const [patient, setPatient] = useState<PatientRecherche | null>(null);
  const [tranches, setTranches] = useState<Tranche[]>([defaultTranche]);
  const [actes, setActes] = useState<string[]>([]);
  const [dureeManuelle, setDureeManuelle] = useState<number | null>(null);
  const [repetition, setRepetition] = useState<RepetitionState>(() => repetitionInitiale(date));
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPatient(null);
      setTranches([defaultTranche]);
      setActes([]);
      setDureeManuelle(null);
      setRepetition(repetitionInitiale(date));
      setErreur(null);
    }
  }, [open, defaultTranche, date]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await rechercherPatientsAction(query);
      setResults(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // null = le serveur calcule la somme des durées des actes (mêmes réglages).
  const dureeEstimeeMin = dureeManuelle;
  const dureeCalculee = dureeDeActes(actes, durees);
  const serie = repetition.actif ? calculerDates(repetition) : null;
  const bloque = pending || tranches.length === 0 || (serie !== null && serie.erreur !== null);

  function handleSubmit() {
    if (!patient) return;
    setErreur(null);
    startTransition(async () => {
      try {
        if (repetition.actif) {
          const fin =
            repetition.modeFin === "date"
              ? ({ type: "date", dateFin: repetition.dateFin } as const)
              : ({ type: "duree", unite: repetition.unite, nombre: repetition.nombre } as const);
          const res = await creerSerieVisitesAction({
            patientId: patient.id,
            dateDebut: repetition.dateDebut,
            frequence: repetition.frequence,
            joursSemaine: repetition.jours,
            tranches,
            actes,
            dureeEstimeeMin,
            fin,
          });
          if (!res.ok) {
            setErreur(res.error);
            return;
          }
          const { crees, ignorees } = res.data;
          onCree?.(
            `${crees} visite${crees > 1 ? "s" : ""} créée${crees > 1 ? "s" : ""}` +
              (ignorees > 0 ? ` · ${ignorees} déjà planifiée${ignorees > 1 ? "s" : ""}` : "")
          );
        } else {
          const res = await creerVisiteAction({
            patientId: patient.id,
            date,
            tranches,
            actes,
            dureeEstimeeMin,
          });
          if (!res.ok) {
            setErreur(res.error);
            return;
          }
          const { crees, ignorees } = res.data;
          if (ignorees > 0) {
            onCree?.(
              crees > 0
                ? `${crees} visite${crees > 1 ? "s" : ""} créée${crees > 1 ? "s" : ""} · ${ignorees} déjà planifiée${ignorees > 1 ? "s" : ""}`
                : "Ce patient a déjà une visite sur cette tranche."
            );
          } else if (crees > 1) {
            onCree?.(`${crees} visites créées.`);
          }
        }
        router.refresh();
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "La création a échoué.");
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nouvelle visite">
      <div className="flex flex-col gap-4 pb-2">
        {!patient ? (
          <div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pine/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un patient…"
                className="w-full rounded-xl border border-line pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-coral bg-white"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-line rounded-xl border border-line overflow-hidden">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setPatient(p)}
                      className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-pine/5"
                    >
                      <span className="font-medium text-pine">
                        {p.prenom} {p.nom}
                      </span>
                      {p.secteurNom && <span className="text-pine/40"> · {p.secteurNom}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-pine/5 px-3.5 py-2.5">
              <span className="text-sm font-medium text-pine">
                {patient.prenom} {patient.nom}
              </span>
              <button onClick={() => setPatient(null)} className="text-xs text-coral font-medium">
                Changer
              </button>
            </div>

            <div>
              <p className="text-sm font-medium text-pine/80 mb-1.5">
                Tranche{tranches.length > 1 ? "s" : ""} horaire{tranches.length > 1 ? "s" : ""}
              </p>
              <TranchesPicker multiple value={tranches} onChange={setTranches} />
            </div>

            <div>
              <p className="text-sm font-medium text-pine/80 mb-1.5">Actes</p>
              <ActesPicker value={actes} onChange={setActes} />
            </div>

            <DureeField calculee={dureeCalculee} valeur={dureeManuelle} onChange={setDureeManuelle} />

            <RepeterSection value={repetition} onChange={setRepetition} passagesParJour={tranches.length} />

            {erreur && (
              <p role="alert" className="text-sm text-statut-absent">
                {erreur}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={bloque}
              className="mt-2 bg-coral text-white font-medium rounded-xl py-3 text-base disabled:opacity-60"
            >
              {pending
                ? "Création…"
                : repetition.actif && serie && !serie.erreur
                  ? `Créer ${serie.dates.length * tranches.length} visite${serie.dates.length * tranches.length > 1 ? "s" : ""}`
                  : tranches.length > 1
                    ? `Ajouter ${tranches.length} visites`
                    : "Ajouter la visite"}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
