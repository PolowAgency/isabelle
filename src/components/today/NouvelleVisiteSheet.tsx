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
import type { Passage } from "@/lib/tournee";
import { ActesPicker } from "./ActesPicker";
import {
  RepeterSection,
  calculerDates,
  repetitionInitiale,
  type RepetitionState,
} from "./RepeterSection";

const PASSAGES: { value: Passage; label: string }[] = [
  { value: "matin", label: "Matin" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
];

export function NouvelleVisiteSheet({
  open,
  onClose,
  date,
  defaultPassage,
  onCree,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  defaultPassage: Passage;
  /** Message de confirmation à afficher (snackbar) une fois la création terminée. */
  onCree?: (message: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientRecherche[]>([]);
  const [patient, setPatient] = useState<PatientRecherche | null>(null);
  const [passage, setPassage] = useState<Passage>(defaultPassage);
  const [actes, setActes] = useState<string[]>([]);
  const [repetition, setRepetition] = useState<RepetitionState>(() => repetitionInitiale(date));
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPatient(null);
      setPassage(defaultPassage);
      setActes([]);
      setRepetition(repetitionInitiale(date));
      setErreur(null);
    }
  }, [open, defaultPassage, date]);

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

  const dureeEstimeeMin = actes.length > 0 ? actes.length * 15 : null;
  const serie = repetition.actif ? calculerDates(repetition) : null;
  const bloque = pending || (serie !== null && serie.erreur !== null);

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
            passages: [passage],
            actes,
            dureeEstimeeMin,
            fin,
          });
          onCree?.(
            `${res.crees} visite${res.crees > 1 ? "s" : ""} créée${res.crees > 1 ? "s" : ""}` +
              (res.ignorees > 0 ? ` · ${res.ignorees} déjà planifiée${res.ignorees > 1 ? "s" : ""}` : "")
          );
        } else {
          await creerVisiteAction({
            patientId: patient.id,
            date,
            passage,
            actes,
            dureeEstimeeMin,
          });
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
              <p className="text-sm font-medium text-pine/80 mb-1.5">Passage</p>
              <div className="flex bg-pine/5 rounded-xl p-1 gap-0.5 w-fit">
                {PASSAGES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPassage(p.value)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium ${
                      passage === p.value ? "bg-pine text-cream" : "text-pine/60"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-pine/80 mb-1.5">Actes</p>
              <ActesPicker value={actes} onChange={setActes} />
            </div>

            <RepeterSection value={repetition} onChange={setRepetition} passagesParJour={1} />

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
                  ? `Créer ${serie.dates.length} visite${serie.dates.length > 1 ? "s" : ""}`
                  : "Ajouter la visite"}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
