"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GrilleSemaine } from "@/components/agenda/GrilleSemaine";
import { absencesDuJour, grilleSemaine } from "@/lib/agenda";
import { INFOS_TRANCHE, type Tranche } from "@/lib/tranches";
import type { WeekVisit } from "@/lib/week";
import { joursDeLaSemaine } from "@/lib/date";
import { POSTE_LABELS, posteDuJour, type Poste } from "@/lib/postes";

export type AbsenceSemaine = {
  id: string;
  soignanteId: string;
  soignantePrenom: string;
  soignanteCouleur: string;
  dateDebut: string;
  dateFin: string;
  motif: string | null;
};

const PASSAGES = [
  { key: "matin", label: "Matin", icon: Sunrise },
  { key: "midi", label: "Midi", icon: Sun },
  { key: "soir", label: "Soir", icon: Sunset },
] as const;

function formatDayShort(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

function formatDayLong(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function statusLabel(statut: WeekVisit["statut"]) {
  switch (statut) {
    case "faite":
      return "Faite";
    case "absent":
      return "Absent";
    case "reportee":
      return "Reportée";
    case "annulee":
      return "Annulée";
    default:
      return "Prévue";
  }
}

const POSTE_CLASSES: Record<Poste, string> = {
  matin: "bg-[#c9954a]/15 text-[#8b6117]",
  midi: "bg-sage/30 text-pine",
  soir: "bg-pine/15 text-pine",
  matin_soir: "bg-coral/15 text-coral",
};

function formatSemaine(lundi: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(
    new Date(`${lundi}T00:00:00`)
  );
}

function statusClasses(statut: WeekVisit["statut"]) {
  switch (statut) {
    case "faite":
      return "bg-statut-faite text-white";
    case "absent":
      return "bg-statut-absent text-white";
    case "reportee":
      return "bg-statut-reportee text-white";
    case "annulee":
      return "bg-pine/20 text-pine";
    default:
      return "bg-pine text-cream";
  }
}

export function DayCard({
  jours,
  visites,
  absences = [],
  durees,
  capaciteMin,
  aujourdhui,
  lundi,
  semainePrecedente,
  semaineSuivante,
  estSemaineCourante,
}: {
  /** Jours dans l'ordre d'affichage : sur la semaine en cours, aujourd'hui en premier. */
  jours: string[];
  visites: WeekVisit[];
  /** Absences de l'équipe qui touchent cette semaine. */
  absences?: AbsenceSemaine[];
  /** Durée (min) de chaque acte et capacité d'une tranche : réglages de l'équipe. */
  durees: Record<string, number>;
  capaciteMin: number;
  aujourdhui: string;
  lundi: string;
  semainePrecedente: string;
  semaineSuivante: string;
  estSemaineCourante: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState(jours[0] ?? "");
  const [selectedSoignanteId, setSelectedSoignanteId] = useState<string>("toutes");
  // Case de la grille choisie : restreint le détail à cette tranche du jour sélectionné.
  const [selectedTranche, setSelectedTranche] = useState<Tranche | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  const soignantes = useMemo(() => {
    return Array.from(
      new Map(
        visites.map((visite) => [
          visite.soignanteId,
          {
            id: visite.soignanteId,
            prenom: visite.soignantePrenom,
            nom: visite.soignanteNom,
            couleur: visite.soignanteCouleur,
          },
        ])
      ).values()
    ).sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));
  }, [visites]);

  const filteredVisites = useMemo(() => {
    if (selectedSoignanteId === "toutes") return visites;
    return visites.filter((visite) => visite.soignanteId === selectedSoignanteId);
  }, [selectedSoignanteId, visites]);

  const lundiAuDimanche = useMemo(() => joursDeLaSemaine(lundi), [lundi]);
  const grille = useMemo(
    () =>
      grilleSemaine(
        visites,
        lundiAuDimanche,
        durees,
        capaciteMin,
        selectedSoignanteId === "toutes" ? undefined : selectedSoignanteId
      ),
    [visites, lundiAuDimanche, durees, capaciteMin, selectedSoignanteId]
  );
  const absencesParJour = lundiAuDimanche.map(
    (j) =>
      absencesDuJour(absences, j).filter((a) => selectedSoignanteId === "toutes" || a.soignanteId === selectedSoignanteId)
        .length
  );

  const absentesLe = (jour: string) =>
    absences.filter(
      (a) =>
        a.dateDebut <= jour &&
        a.dateFin >= jour &&
        (selectedSoignanteId === "toutes" || a.soignanteId === selectedSoignanteId)
    );

  const weekRows = useMemo(() => {
    return jours.map((jour) => {
      const dayVisits = filteredVisites.filter((visite) => visite.date === jour);
      const total = dayVisits.length;
      const done = dayVisits.filter((visite) => visite.statut === "faite").length;

      const postes = soignantes
        .map((soignante) => ({
          ...soignante,
          poste: posteDuJour(
            dayVisits.filter((visite) => visite.soignanteId === soignante.id).map((visite) => visite.tranche)
          ),
        }))
        .filter((soignante) => soignante.poste !== null);

      return {
        jour,
        passe: jour < aujourdhui,
        postes,
        total,
        done,
        passages: PASSAGES.map((passage) => {
          const bucket = dayVisits.filter((visite) => visite.passage === passage.key);
          const uniqueSoignantes = Array.from(
            new Map(bucket.map((visite) => [visite.soignanteId, visite])).values()
          );
          const completed = bucket.filter((visite) => visite.statut === "faite").length;

          return {
            ...passage,
            count: bucket.length,
            completed,
            soignantes: uniqueSoignantes,
          };
        }),
      };
    });
  }, [filteredVisites, jours, soignantes, aujourdhui]);

  const selectedDayVisits = useMemo(() => {
    return filteredVisites.filter(
      (visite) => visite.date === selectedDay && (selectedTranche === null || visite.tranche === selectedTranche)
    );
  }, [filteredVisites, selectedDay, selectedTranche]);

  const detailBySoignante = useMemo(() => {
    return soignantes
      .map((soignante) => ({
        ...soignante,
        poste: posteDuJour(
          selectedDayVisits
            .filter((visite) => visite.soignanteId === soignante.id)
            .map((visite) => visite.tranche)
        ),
        passages: PASSAGES.map((passage) => ({
          ...passage,
          items: selectedDayVisits.filter(
            (visite) =>
              visite.soignanteId === soignante.id && visite.passage === passage.key
          ),
        })).filter((passage) => passage.items.length > 0),
      }))
      .filter((soignante) => soignante.passages.length > 0);
  }, [selectedDayVisits, soignantes]);

  const totalWeek = filteredVisites.length;
  const completedWeek = filteredVisites.filter((visite) => visite.statut === "faite").length;
  const selectedSummary = PASSAGES.map((passage) => ({
    ...passage,
    count: selectedDayVisits.filter((visite) => visite.passage === passage.key).length,
    completed: selectedDayVisits.filter(
      (visite) => visite.passage === passage.key && visite.statut === "faite"
    ).length,
  }));

  function handleSelectDay(day: string) {
    setSelectedDay(day);
    setSelectedTranche(null);
    // Le détail du jour est au-dessus de la liste des jours.
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleSelectCase(jour: string, tranche: Tranche) {
    setSelectedDay(jour);
    setSelectedTranche(tranche);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-[28px] border border-line/80 bg-card shadow-card">
        <div className="border-b border-line/80 bg-[linear-gradient(135deg,rgba(37,69,58,0.96),rgba(82,120,104,0.9))] px-4 py-4 text-cream">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream/70">
                {estSemaineCourante ? "Semaine en cours" : "Semaine"}
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">
                Du {formatSemaine(lundi)}
              </h2>
              <p className="mt-1 text-sm text-cream/75">
                {totalWeek} visite{totalWeek > 1 ? "s" : ""} planifiée{totalWeek > 1 ? "s" : ""} sur 7 jours
              </p>
              <p className="mt-1 text-xs text-cream/60">
                {completedWeek} déjà faites sur la semaine
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
              <p className="text-xs font-medium text-cream/65">Sélection</p>
              <p className="font-serif text-lg capitalize">
                {selectedDay ? formatDayShort(selectedDay) : "Aucun jour"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <nav aria-label="Changer de semaine" className="flex items-center justify-between gap-2">
            <Link
              href={`/semaine?semaine=${semainePrecedente}`}
              aria-label="Semaine précédente"
              className="inline-flex items-center gap-1 rounded-full bg-cream px-3 py-2 text-sm font-medium text-pine"
            >
              <ChevronLeft size={16} />
              Précédente
            </Link>
            {!estSemaineCourante && (
              <Link
                href="/semaine"
                className="rounded-full bg-coral px-3 py-2 text-sm font-semibold text-white"
              >
                Aujourd&apos;hui
              </Link>
            )}
            <Link
              href={`/semaine?semaine=${semaineSuivante}`}
              aria-label="Semaine suivante"
              className="inline-flex items-center gap-1 rounded-full bg-cream px-3 py-2 text-sm font-medium text-pine"
            >
              Suivante
              <ChevronRight size={16} />
            </Link>
          </nav>

          <div className="rounded-[24px] border border-line/70 bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine/45">
              Charge de la semaine
            </p>
            <GrilleSemaine
              jours={lundiAuDimanche}
              grille={grille}
              aujourdhui={aujourdhui}
              absencesParJour={absencesParJour}
              jourSelectionne={selectedDay}
              trancheSelectionnee={selectedTranche}
              onSelectionner={handleSelectCase}
            />
          </div>

          <div className="rounded-[24px] border border-line/70 bg-cream/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pine/45">
              Filtrer par collègue
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedSoignanteId("toutes")}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  selectedSoignanteId === "toutes"
                    ? "bg-pine text-cream"
                    : "bg-card text-pine/65"
                }`}
              >
                Toute l&apos;équipe
              </button>

              {soignantes.map((soignante) => {
                const active = selectedSoignanteId === soignante.id;
                return (
                  <button
                    key={soignante.id}
                    type="button"
                    onClick={() => setSelectedSoignanteId(soignante.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-card text-pine ring-2 ring-pine/20" : "bg-card/80 text-pine/65"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: soignante.couleur }}
                    />
                    {soignante.prenom}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </section>

      <section
        ref={detailRef}
        className="rounded-[28px] border border-line/80 bg-card p-4 shadow-card"
      >
        <div className="mb-4 flex items-center gap-2 text-pine">
          <Clock3 size={18} />
          <div>
            <h2 className="font-serif text-xl font-semibold capitalize">
              {selectedDay ? formatDayLong(selectedDay) : "Détail du jour"}
            </h2>
            <p className="text-sm text-pine/55">
              {selectedTranche
                ? `Tranche ${INFOS_TRANCHE[selectedTranche].label}`
                : "Planning détaillé par patient, avec statut et soignante responsable."}
            </p>
            {selectedTranche && (
              <button
                type="button"
                onClick={() => setSelectedTranche(null)}
                className="mt-1 text-xs font-semibold text-coral"
              >
                Voir tout le jour
              </button>
            )}
          </div>
        </div>

        <AbsencesDuJour absentes={absentesLe(selectedDay)} />

        <div className="mb-4 grid grid-cols-3 gap-2">
          {selectedSummary.map((passage) => {
            const Icon = passage.icon;

            return (
              <div
                key={passage.key}
                className="rounded-2xl border border-line/70 bg-cream px-3 py-3"
              >
                <div className="flex items-center gap-2 text-pine/65">
                  <Icon size={14} />
                  <span className="text-xs font-semibold">{passage.label}</span>
                </div>
                <p className="mt-2 text-xl font-semibold text-ink">{passage.count}</p>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-statut-faite">
                  <CheckCircle2 size={12} />
                  {passage.completed} faites
                </div>
              </div>
            );
          })}
        </div>

        {selectedDayVisits.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="Aucune visite"
            description="Aucune visite planifiée pour ce jour."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {detailBySoignante.map((soignante) => (
              <div key={soignante.id} className="rounded-[24px] bg-cream/75 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: soignante.couleur }}
                    />
                    <h3 className="font-serif text-lg font-semibold text-ink">
                      {soignante.prenom} {soignante.nom}
                    </h3>
                    {soignante.poste && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${POSTE_CLASSES[soignante.poste]}`}
                      >
                        {POSTE_LABELS[soignante.poste]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-pine/50">
                    {soignante.passages.reduce((sum, passage) => sum + passage.items.length, 0)} passage
                    {soignante.passages.reduce((sum, passage) => sum + passage.items.length, 0) > 1
                      ? "s"
                      : ""}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {soignante.passages.map((passage) => {
                    const Icon = passage.icon;

                    return (
                      <div key={`${soignante.id}-${passage.key}`} className="rounded-2xl bg-card p-3">
                        <div className="mb-3 flex items-center gap-2 text-pine">
                          <Icon size={16} />
                          <h4 className="text-sm font-semibold uppercase tracking-[0.14em]">
                            {passage.label}
                          </h4>
                        </div>

                        <div className="flex flex-col gap-2">
                          {passage.items.map((visite) => (
                            <Link
                              key={visite.id}
                              href={`/patients/${visite.patientId}`}
                              className="rounded-2xl border border-line/70 bg-cream px-4 py-3 transition hover:border-pine/40 hover:bg-cream/80"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-ink">
                                    {visite.patientPrenom} {visite.patientNom}
                                  </p>
                                  <p className="mt-1 text-xs text-pine/55">{visite.secteurNom}</p>
                                  <p className="mt-2 text-xs text-pine/45">
                                    Ouvrir la fiche patiente pour voir le détail complet.
                                  </p>
                                </div>

                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(
                                    visite.statut
                                  )}`}
                                >
                                  {statusLabel(visite.statut)}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-line/80 bg-card p-3 shadow-card">
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-pine/45">
          {estSemaineCourante ? "Jours de la semaine" : "Les 7 jours"}
        </p>
        <div className="flex flex-col gap-3">
          {weekRows.map((row) => {
            const selected = row.jour === selectedDay;

            return (
              <button
                key={row.jour}
                type="button"
                onClick={() => handleSelectDay(row.jour)}
                className={`rounded-[24px] border px-3 py-3 text-left transition ${
                  selected
                    ? "border-pine bg-pine/6 shadow-card"
                    : "border-line/70 bg-cream/65"
                } ${row.passe && !selected ? "opacity-60" : ""}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className={`font-serif text-lg font-semibold capitalize ${selected ? "text-pine" : "text-ink"}`}>
                      {formatDayLong(row.jour)}
                      {row.jour === aujourdhui && (
                        <span className="ml-2 rounded-full bg-coral px-2 py-0.5 align-middle font-sans text-[10px] font-semibold uppercase tracking-wide text-white">
                          Aujourd&apos;hui
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-pine/55">
                      {row.total} visite{row.total > 1 ? "s" : ""} planifiée{row.total > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-xs text-statut-faite">
                      {row.done} faite{row.done > 1 ? "s" : ""} ce jour
                    </p>
                    <AbsencesDuJour absentes={absentesLe(row.jour)} compact />
                    {row.postes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.postes.map((soignante) => (
                          <span
                            key={soignante.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-1 text-[11px] text-pine/70"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: soignante.couleur }}
                            />
                            <span className="font-semibold text-ink">{soignante.prenom}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 font-semibold ${POSTE_CLASSES[soignante.poste!]}`}
                            >
                              {POSTE_LABELS[soignante.poste!]}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selected ? "bg-coral text-white" : "bg-card text-pine/60"
                    }`}
                  >
                    {selected ? "Détail actif" : "Voir le détail"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {row.passages.map((passage) => {
                    const Icon = passage.icon;

                    return (
                      <div
                        key={passage.key}
                        className={`rounded-2xl border px-3 py-3 ${
                          selected
                            ? "border-pine/15 bg-card"
                            : "border-line/70 bg-card/80"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-pine/65">
                          <Icon size={14} />
                          <span className="text-xs font-semibold">{passage.label}</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold text-ink">{passage.count}</p>
                        <p className="mt-1 text-[11px] text-statut-faite">
                          {passage.completed} faite{passage.completed > 1 ? "s" : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-pine/45">
                          {passage.soignantes.length} soignante{passage.soignantes.length > 1 ? "s" : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {passage.soignantes.length === 0 ? (
                            <span className="text-[11px] text-pine/35">Aucune</span>
                          ) : (
                            passage.soignantes.map((visite) => (
                              <span
                                key={`${row.jour}-${passage.key}-${visite.soignanteId}`}
                                className="inline-flex h-5 w-5 rounded-full"
                                style={{ backgroundColor: visite.soignanteCouleur }}
                                title={visite.soignantePrenom}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Absences de l'équipe un jour donné (motif sans détail médical). */
function AbsencesDuJour({ absentes, compact = false }: { absentes: AbsenceSemaine[]; compact?: boolean }) {
  if (absentes.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "mt-2" : "mb-4"}`}>
      {absentes.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-statut-reportee/40 bg-statut-reportee/10 px-2.5 py-1 text-[11px] font-medium text-statut-reportee"
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.soignanteCouleur }} aria-hidden />
          {a.soignantePrenom} absente{a.motif ? ` · ${a.motif}` : ""}
        </span>
      ))}
    </div>
  );
}
