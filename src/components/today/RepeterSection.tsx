"use client";

import { useMemo, useState } from "react";
import {
  FREQUENCE_LABELS,
  JOURS_SEMAINE_COURTS,
  JOURS_SEMAINE_LABELS,
  dateFinDepuisDuree,
  genererDatesSerie,
  type UniteDuree,
} from "@/lib/recurrence";
import type { FrequenceSerie } from "@/lib/schema";
import { formatDateLong } from "@/lib/date";

export type RepetitionState = {
  actif: boolean;
  dateDebut: string;
  frequence: FrequenceSerie;
  jours: number[];
  modeFin: "duree" | "date";
  nombre: number;
  unite: UniteDuree;
  dateFin: string;
};

export function repetitionInitiale(dateDebut: string): RepetitionState {
  return {
    actif: false,
    dateDebut,
    frequence: "quotidien",
    jours: [],
    modeFin: "duree",
    nombre: 1,
    unite: "mois",
    dateFin: "",
  };
}

/**
 * Dates de la série d'après l'état du formulaire, ou une erreur lisible. La série peut commencer dans le
 * passé (dates d'une ordonnance) : `dates` ne contient que les jours à venir (aujourd'hui compris),
 * `passes` compte les jours déjà écoulés, pour lesquels aucune visite n'est créée.
 */
export function calculerDates(
  rep: RepetitionState,
  aujourdhui?: string
): { dates: string[]; passes: number; erreur: string | null } {
  try {
    const dateFin =
      rep.modeFin === "date"
        ? rep.dateFin
        : dateFinDepuisDuree(rep.dateDebut, rep.unite, rep.nombre);
    if (!dateFin) return { dates: [], passes: 0, erreur: "Choisissez une date de fin." };
    const toutes = genererDatesSerie({
      dateDebut: rep.dateDebut,
      dateFin,
      frequence: rep.frequence,
      joursSemaine: rep.jours,
    });
    if (toutes.length === 0) return { dates: [], passes: 0, erreur: "Aucune date ne correspond." };
    const dates = aujourdhui ? toutes.filter((d) => d >= aujourdhui) : toutes;
    if (dates.length === 0) {
      return { dates, passes: toutes.length, erreur: "Toutes les dates de cette série sont déjà passées." };
    }
    return { dates, passes: toutes.length - dates.length, erreur: null };
  } catch (e) {
    return { dates: [], passes: 0, erreur: e instanceof Error ? e.message : "Récurrence invalide." };
  }
}

const UNITES: { value: UniteDuree; label: string }[] = [
  { value: "jours", label: "jours" },
  { value: "semaines", label: "semaines" },
  { value: "mois", label: "mois" },
];

export function RepeterSection({
  value,
  onChange,
  passagesParJour,
  aujourdhui,
}: {
  value: RepetitionState;
  onChange: (next: RepetitionState) => void;
  /** Jour courant : les jours antérieurs d'une série (ordonnance en cours) ne créent aucune visite. */
  aujourdhui: string;
  /** Nombre de passages créés chaque jour (pour annoncer le total de visites). */
  passagesParJour: number;
}) {
  const { dates, passes, erreur } = useMemo(() => calculerDates(value, aujourdhui), [value, aujourdhui]);
  // Saisie en cours du nombre : on peut effacer le « 1 » puis taper « 6 » ; la valeur n'est corrigée qu'en quittant le champ.
  const [saisieNombre, setSaisieNombre] = useState<string | null>(null);
  const set = (patch: Partial<RepetitionState>) => onChange({ ...value, ...patch });
  const afficherJours =
    value.frequence === "jours_semaine" || value.frequence === "une_semaine_sur_deux";

  return (
    <div>
      <p className="text-sm font-medium text-pine/80 mb-1.5">Répéter</p>
      <div className="flex bg-pine/5 rounded-xl p-1 gap-0.5 w-fit">
        {[
          { actif: false, label: "Une seule fois" },
          { actif: true, label: "Soin récurrent" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => set({ actif: o.actif })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium ${
              value.actif === o.actif ? "bg-pine text-cream" : "text-pine/60"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {value.actif && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line/70 bg-cream/60 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">À partir du</span>
            <input
              type="date"
              value={value.dateDebut}
              onChange={(e) => set({ dateDebut: e.target.value })}
              className="rounded-xl border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coral"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-pine/60">Fréquence</span>
            <select
              value={value.frequence}
              onChange={(e) => set({ frequence: e.target.value as FrequenceSerie })}
              className="rounded-xl border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coral"
            >
              {(Object.keys(FREQUENCE_LABELS) as FrequenceSerie[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCE_LABELS[f]}
                </option>
              ))}
            </select>
          </label>

          {afficherJours && (
            <div>
              <p className="text-xs font-medium text-pine/60 mb-1">
                {value.frequence === "jours_semaine"
                  ? "Jours de la semaine"
                  : "Jours (par défaut : le jour de départ)"}
              </p>
              <div className="flex gap-1.5">
                {JOURS_SEMAINE_COURTS.map((lettre, index) => {
                  const jour = index + 1;
                  const actif = value.jours.includes(jour);
                  return (
                    <button
                      key={jour}
                      type="button"
                      aria-label={JOURS_SEMAINE_LABELS[index]}
                      aria-pressed={actif}
                      onClick={() =>
                        set({
                          jours: actif ? value.jours.filter((j) => j !== jour) : [...value.jours, jour],
                        })
                      }
                      className={`h-9 w-9 rounded-full text-xs font-semibold border ${
                        actif ? "bg-coral text-white border-coral" : "border-line text-pine/60 bg-white"
                      }`}
                    >
                      {lettre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-pine/60">Durée</span>
              <button
                type="button"
                onClick={() => set({ modeFin: value.modeFin === "duree" ? "date" : "duree" })}
                className="text-xs font-medium text-coral"
              >
                {value.modeFin === "duree" ? "Choisir une date de fin" : "Choisir une durée"}
              </button>
            </div>
            {value.modeFin === "duree" ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={366}
                  value={saisieNombre ?? value.nombre}
                  onChange={(e) => {
                    setSaisieNombre(e.target.value);
                    const n = Math.floor(Number(e.target.value));
                    if (e.target.value !== "" && n >= 1) set({ nombre: Math.min(366, n) });
                  }}
                  onBlur={() => setSaisieNombre(null)}
                  className="w-24 rounded-xl border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coral"
                />
                <select
                  value={value.unite}
                  onChange={(e) => set({ unite: e.target.value as UniteDuree })}
                  className="flex-1 rounded-xl border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coral"
                >
                  {UNITES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                type="date"
                value={value.dateFin}
                min={value.dateDebut}
                onChange={(e) => set({ dateFin: e.target.value })}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coral"
              />
            )}
          </div>

          <p className={`text-xs ${erreur ? "text-statut-absent" : "text-pine/60"}`}>
            {erreur ??
              `${dates.length * passagesParJour} visite${dates.length * passagesParJour > 1 ? "s" : ""} · du ${formatDateLong(
                dates[0]
              )} au ${formatDateLong(dates[dates.length - 1])}`}
          </p>
          {passes > 0 && !erreur && (
            <p className="text-xs text-pine/55">
              {passes} jour{passes > 1 ? "s" : ""} déjà passé{passes > 1 ? "s" : ""} (série commencée le{" "}
              {formatDateLong(value.dateDebut)}) : aucune visite n&apos;est créée pour {passes > 1 ? "eux" : "lui"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
