"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, ChevronDown, ListChecks, Users } from "lucide-react";
import type { Passage, StatutVisite, VisiteLigne, VueTournee } from "@/lib/tournee";
import { marquerVisiteAction } from "@/app/(app)/actions";
import { formatDateLong } from "@/lib/date";
import { useSoignanteContext } from "@/lib/soignante-context";
import { VisiteCard } from "./VisiteCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveClock } from "@/components/ui/LiveClock";
import { Snackbar } from "@/components/ui/Snackbar";
import { Fab } from "@/components/nav/Fab";
import { NouvelleVisiteSheet } from "./NouvelleVisiteSheet";
import { GererTourneeSheet } from "./GererTourneeSheet";
import { VisiteActionsSheet } from "./VisiteActionsSheet";
import { PremiersPas } from "./PremiersPas";
import type { Onboarding } from "@/lib/onboarding";

const PASSAGES: { value: Passage; label: string }[] = [
  { value: "matin", label: "Matin" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
];

type Groupe = {
  secteurId: string | null;
  secteurNom: string;
  secteurOrdre: number;
  visites: VisiteLigne[];
  total: number;
  faites: number;
  termine: boolean;
};

type FlatItem =
  | { type: "secteur"; groupe: Groupe }
  | { type: "visite"; visite: VisiteLigne; groupeId: string };

function formatHeure(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statutBadgeClasses(statut: StatutVisite) {
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

function statutLabel(statut: StatutVisite) {
  switch (statut) {
    case "faite":
      return "Faite";
    case "absent":
      return "Absente";
    case "reportee":
      return "Reportée";
    case "annulee":
      return "Annulée";
    default:
      return "Prévue";
  }
}

export function TourneeScreen({
  visitesInitiales,
  date,
  passage,
  vue,
  onboarding,
  admin,
}: {
  onboarding: Onboarding;
  admin: boolean;
  visitesInitiales: VisiteLigne[];
  date: string;
  passage: Passage;
  vue: VueTournee;
}) {
  const [items, setItems] = useState(visitesInitiales);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{ visiteId: string; previous: StatutVisite } | null>(null);
  const [nouvelleVisiteOpen, setNouvelleVisiteOpen] = useState(false);
  const [gererOpen, setGererOpen] = useState(false);
  const [visiteActions, setVisiteActions] = useState<VisiteLigne | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { current } = useSoignanteContext();

  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Les trois infirmières partagent les mêmes patients : quand une collègue
  // valide une visite, on recharge les données serveur (toutes les 45 s et au
  // retour sur l'appli) puis on réaligne l'état local dessus.
  useEffect(() => {
    setItems(visitesInitiales);
  }, [visitesInitiales]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 45_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  const groupes = useMemo<Groupe[]>(() => {
    const map = new Map<string, Groupe>();
    for (const v of items) {
      const key = v.secteurId ?? "sans-secteur";
      if (!map.has(key)) {
        map.set(key, {
          secteurId: v.secteurId,
          secteurNom: v.secteurNom ?? "Sans secteur",
          secteurOrdre: v.secteurOrdre,
          visites: [],
          total: 0,
          faites: 0,
          termine: false,
        });
      }
      const g = map.get(key)!;
      g.visites.push(v);
      g.total += 1;
      if (v.statut === "faite") g.faites += 1;
    }
    const list = Array.from(map.values());
    for (const g of list) {
      g.termine = g.visites.every((v) => v.statut !== "prevue");
    }
    list.sort((a, b) => a.secteurOrdre - b.secteurOrdre);
    return list;
  }, [items]);

  const flatItems = useMemo<FlatItem[]>(() => {
    const flat: FlatItem[] = [];
    for (const g of groupes) {
      const key = g.secteurId ?? "sans-secteur";
      flat.push({ type: "secteur", groupe: g });
      const expanded = overrides[key] ?? !g.termine;
      if (expanded) {
        for (const v of g.visites) flat.push({ type: "visite", visite: v, groupeId: key });
      }
    }
    return flat;
  }, [groupes, overrides]);

  const virtualizer = useWindowVirtualizer({
    count: flatItems.length,
    estimateSize: (i) => (flatItems[i].type === "secteur" ? 40 : 74),
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const totalGlobal = items.length;
  const faitesGlobal = items.filter((v) => v.statut === "faite").length;
  const absentesGlobal = items.filter((v) => v.statut === "absent").length;
  const reporteesGlobal = items.filter((v) => v.statut === "reportee").length;
  const alertesGlobal = items.filter((v) => v.transmissionNonLue || v.ordonnanceAlerte).length;
  const pct = totalGlobal > 0 ? Math.round((faitesGlobal / totalGlobal) * 100) : 0;
  const activiteEquipe = useMemo(() => {
    const map = new Map<
      string,
      {
        prenom: string;
        couleur: string;
        faites: number;
        prevues: number;
      }
    >();

    for (const item of items) {
      if (!map.has(item.soignanteId)) {
        map.set(item.soignanteId, {
          prenom: item.soignantePrenom,
          couleur: item.soignanteCouleur,
          faites: 0,
          prevues: 0,
        });
      }

      const soignante = map.get(item.soignanteId)!;
      if (item.statut === "faite") {
        soignante.faites += 1;
      }
      if (item.statut === "prevue") {
        soignante.prevues += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.prenom.localeCompare(b.prenom));
  }, [items]);
  const journalPassage = useMemo(() => {
    return items
      .filter((item) => item.statut !== "prevue")
      .sort((a, b) => {
        const aTime = a.heureReelle ? new Date(a.heureReelle).getTime() : 0;
        const bTime = b.heureReelle ? new Date(b.heureReelle).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [items]);

  async function handleMarquer(visiteId: string, statut: "faite" | "absent" | "reportee") {
    const current = items.find((v) => v.id === visiteId);
    if (!current) return;
    const previous = current.statut;

    setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut } : v)));
    if (statut === "faite") {
      setUndo({ visiteId, previous });
    }

    try {
      await marquerVisiteAction(visiteId, statut);
    } catch {
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
    }
  }

  async function handleUndo() {
    if (!undo) return;
    const { visiteId, previous } = undo;
    setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
    try {
      await marquerVisiteAction(visiteId, previous);
    } catch {
      // best-effort — l'état local reste correct même si la sync échoue
    }
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <header className="sticky top-0 z-20 bg-cream/95 backdrop-blur-sm border-b border-line px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-lg font-semibold text-pine capitalize leading-tight">
                {formatDateLong(date)}
              </h1>
              <LiveClock className="inline-flex items-center gap-1.5 rounded-full bg-pine/5 px-2 py-0.5 text-[11px] font-semibold text-pine/60" />
            </div>
            <p className="text-xs text-pine/50">
              {faitesGlobal} sur {totalGlobal} faites
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setGererOpen(true)}
              aria-label="Gérer la tournée"
              className="h-9 w-9 rounded-full flex items-center justify-center text-pine/60 hover:bg-pine/5"
            >
              <ListChecks size={19} />
            </button>
            <Link
              href="/compte"
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ backgroundColor: current.couleur }}
              aria-label="Compte"
            >
              {current.prenom[0]}
            </Link>
          </div>
        </div>

        <div className="h-1.5 bg-line rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-coral transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-pine/5 rounded-xl p-1 gap-0.5">
            {PASSAGES.map((p) => (
              <Link
                key={p.value}
                href={`/?passage=${p.value}&vue=${vue}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  passage === p.value ? "bg-pine text-cream" : "text-pine/60"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>

          <Link
            href={`/?passage=${passage}&vue=${vue === "mine" ? "equipe" : "mine"}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border ${
              vue === "equipe" ? "border-coral text-coral" : "border-line text-pine/60"
            }`}
          >
            <Users size={14} />
            {vue === "equipe" ? "Équipe" : "Mes visites"}
          </Link>
        </div>
      </header>

      <div ref={listRef} className="flex-1 px-4 pt-3">
        <PremiersPas
          onboarding={onboarding}
          prenom={current.prenom}
          admin={admin}
          onPlanifier={() => setNouvelleVisiteOpen(true)}
        />

        <section className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <StatPill tone="faite" label="faites" value={faitesGlobal} />
            <StatPill tone="prevue" label="à faire" value={totalGlobal - faitesGlobal - absentesGlobal - reporteesGlobal} />
            {absentesGlobal > 0 && <StatPill tone="absent" label="absentes" value={absentesGlobal} />}
            {reporteesGlobal > 0 && <StatPill tone="reportee" label="reportées" value={reporteesGlobal} />}
            {alertesGlobal > 0 && (
              <Link
                href="/alertes"
                className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2.5 py-1 text-coral"
              >
                <AlertCircle size={13} />
                {alertesGlobal} alerte{alertesGlobal > 1 ? "s" : ""}
              </Link>
            )}
          </div>

          {vue === "equipe" && activiteEquipe.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activiteEquipe.map((soignante) => (
                <span
                  key={soignante.prenom}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs text-pine/70"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: soignante.couleur }}
                  />
                  <span className="font-semibold text-ink">{soignante.prenom}</span>
                  {soignante.faites} faites · {soignante.prevues} à faire
                </span>
              ))}
            </div>
          )}

          {journalPassage.length > 0 && (
            <details className="rounded-2xl border border-line/70 bg-card px-3 py-2 text-sm">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-pine/50">
                Déjà passé ({journalPassage.length})
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {journalPassage.map((visite) => (
                  <Link
                    key={visite.id}
                    href={`/patients/${visite.patientId}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {visite.patientPrenom} {visite.patientNom}
                      </p>
                      <p className="truncate text-xs text-pine/55">
                        {visite.soignantePrenom}
                        {visite.heureReelle ? ` · ${formatHeure(visite.heureReelle)}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statutBadgeClasses(
                        visite.statut
                      )}`}
                    >
                      {statutLabel(visite.statut)}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </section>

        {flatItems.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Aucune visite"
            description={`Pas de passage ${passage} prévu${vue === "mine" ? " pour toi" : ""} aujourd'hui.`}
          />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              const top = virtualRow.start - virtualizer.options.scrollMargin;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${top}px)`,
                    paddingBottom: item.type === "visite" ? 8 : 4,
                  }}
                >
                  {item.type === "secteur" ? (
                    <SecteurHeader
                      groupe={item.groupe}
                      expanded={overrides[item.groupe.secteurId ?? "sans-secteur"] ?? !item.groupe.termine}
                      onToggle={() => {
                        const key = item.groupe.secteurId ?? "sans-secteur";
                        setOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? !item.groupe.termine) }));
                      }}
                    />
                  ) : (
                    <VisiteCard
                      visite={item.visite}
                      vue={vue}
                      onMarquer={(statut) => handleMarquer(item.visite.id, statut)}
                      onOptions={() => setVisiteActions(item.visite)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Fab onClick={() => setNouvelleVisiteOpen(true)} />

      {undo && (
        <Snackbar
          message="Visite marquée faite."
          actionLabel="Annuler"
          onAction={handleUndo}
          onDismiss={() => setUndo(null)}
        />
      )}

      {info && <Snackbar message={info} onDismiss={() => setInfo(null)} />}

      <NouvelleVisiteSheet
        open={nouvelleVisiteOpen}
        onClose={() => setNouvelleVisiteOpen(false)}
        date={date}
        defaultPassage={passage}
        onCree={setInfo}
      />

      <VisiteActionsSheet
        visite={visiteActions}
        onClose={() => setVisiteActions(null)}
        onDone={setInfo}
      />

      <GererTourneeSheet open={gererOpen} onClose={() => setGererOpen(false)} date={date} />
    </div>
  );
}

function StatPill({
  tone,
  label,
  value,
}: {
  tone: "faite" | "prevue" | "absent" | "reportee";
  label: string;
  value: number;
}) {
  const tones = {
    faite: "bg-statut-faite/10 text-statut-faite",
    prevue: "bg-pine/5 text-pine/70",
    absent: "bg-statut-absent/10 text-statut-absent",
    reportee: "bg-statut-reportee/10 text-statut-reportee",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${tones[tone]}`}>
      <strong className="font-semibold">{value}</strong> {label}
    </span>
  );
}

function SecteurHeader({
  groupe,
  expanded,
  onToggle,
}: {
  groupe: Groupe;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (groupe.termine && !expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-2 text-sm text-pine/50"
      >
        <span>
          {groupe.secteurNom} — {groupe.faites}/{groupe.total} ✓
        </span>
        <ChevronDown size={16} className="-rotate-90" />
      </button>
    );
  }

  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-1 py-2">
      <span className="text-sm font-semibold text-pine">
        {groupe.secteurNom}{" "}
        <span className="font-normal text-pine/40">
          {groupe.faites}/{groupe.total}
        </span>
      </span>
      <ChevronDown size={16} className={`text-pine/40 transition-transform ${expanded ? "" : "-rotate-90"}`} />
    </button>
  );
}
