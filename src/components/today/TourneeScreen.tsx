"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, ChevronDown, ListChecks, Users } from "lucide-react";
import type { StatutVisite, VisiteLigne, VuePassage, VueTournee } from "@/lib/tournee";
import {
  INFOS_TRANCHE,
  TRANCHES,
  etatTranche,
  libelleTranche,
  type EtatTranche,
  type Tranche,
} from "@/lib/tranches";
import { decalerVisiteAction, deplacerVisiteAction, marquerArriveeAction, marquerVisiteAction } from "@/app/(app)/actions";
import { deplacerVisitesDansTranche as deplacerParmiLaTranche } from "@/lib/ordre";
import { traitementsSansReponse, type PriseSaisie } from "@/lib/prises-calc";
import { TraitementsSheet } from "@/components/prises/TraitementsSheet";
import { formatDateLong, heureParis } from "@/lib/date";
import { useSoignanteContext } from "@/lib/soignante-context";
import { ApercuJournee } from "@/components/agenda/ApercuJournee";
import { agregerParTranche, dureeDeLaVisite, etatCharge, formaterDuree, type EtatCharge, type ReglagesPlanning } from "@/lib/planning-calc";
import { VisiteCard } from "./VisiteCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveClock } from "@/components/ui/LiveClock";
import { Snackbar } from "@/components/ui/Snackbar";
import { Fab } from "@/components/nav/Fab";
import { NouvelleVisiteSheet } from "./NouvelleVisiteSheet";
import { GererTourneeSheet } from "./GererTourneeSheet";
import { VisiteActionsSheet } from "./VisiteActionsSheet";
import { ActesRequisSheet } from "./ActesRequisSheet";
import { reseauIndisponible } from "@/lib/offline/client";
import { mettreEnFile, nouvelleOperation, nouvelleOperationRapide } from "@/lib/offline/file";
import { horsLigneActive } from "@/lib/offline/stockage";
import type { OperationHorsLigne } from "@/lib/offline/types";
import { TransfertSheet, type ChoixTransfert } from "@/components/transferts/TransfertSheet";
import { PremiersPas } from "./PremiersPas";
import type { Onboarding } from "@/lib/onboarding";

const PASSAGES: { value: VuePassage; label: string }[] = [
  { value: "jour", label: "Journée" },
  { value: "matin", label: "Matin" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
];

// Un groupe = un secteur (vue d'un passage) ou une tranche horaire (vue « Journée »).
type Groupe = {
  key: string;
  titre: string;
  ordre: number;
  tranche: Tranche | null;
  visites: VisiteLigne[];
  total: number;
  faites: number;
  restantes: number;
  termine: boolean;
  /** Temps prévu de la tranche (visites non annulées) et charge de la soignante la plus chargée. */
  dureeMin: number;
  chargeMaxMin: number;
};

type FlatItem =
  | { type: "entete"; groupe: Groupe }
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
  planning,
  admin,
}: {
  onboarding: Onboarding;
  planning: ReglagesPlanning;
  admin: boolean;
  visitesInitiales: VisiteLigne[];
  date: string;
  passage: VuePassage;
  vue: VueTournee;
}) {
  const [items, setItems] = useState(visitesInitiales);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{ visiteId: string; previous: StatutVisite } | null>(null);
  const [nouvelleVisiteOpen, setNouvelleVisiteOpen] = useState(false);
  // Tranche choisie depuis l'aperçu de la journée (sinon : celle de l'heure courante).
  const [trancheImposee, setTrancheImposee] = useState<Tranche | null>(null);
  const [gererOpen, setGererOpen] = useState(false);
  const [visiteActions, setVisiteActions] = useState<VisiteLigne | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [transfert, setTransfert] = useState<ChoixTransfert[] | null>(null);
  const [actesRequis, setActesRequis] = useState<VisiteLigne | null>(null);
  // Traitements du passage à renseigner avant de valider (avec les actes déjà choisis, le cas échéant).
  const [traitementsRequis, setTraitementsRequis] = useState<{ visite: VisiteLigne; actes?: string[] } | null>(null);
  const { current } = useSoignanteContext();
  // Heure de Paris, posée après le montage (évite un écart serveur / client) et rafraîchie chaque minute.
  const [heure, setHeure] = useState<number | null>(null);
  useEffect(() => {
    const maj = () => setHeure(heureParis());
    maj();
    const timer = setInterval(maj, 60_000);
    return () => clearInterval(timer);
  }, []);

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

  const parTranche = passage === "jour";

  const groupes = useMemo<Groupe[]>(() => {
    const map = new Map<string, Groupe>();
    const parSoignante = new Map<string, number>();
    for (const v of items) {
      const key = parTranche ? v.tranche : (v.secteurId ?? "sans-secteur");
      if (!map.has(key)) {
        map.set(key, {
          key,
          titre: parTranche ? libelleTranche(v.tranche) : (v.secteurNom ?? "Sans secteur"),
          ordre: parTranche ? TRANCHES.indexOf(v.tranche) : v.secteurOrdre,
          tranche: parTranche ? v.tranche : null,
          visites: [],
          total: 0,
          faites: 0,
          restantes: 0,
          termine: false,
          dureeMin: 0,
          chargeMaxMin: 0,
        });
      }
      const g = map.get(key)!;
      g.visites.push(v);
      g.total += 1;
      const duree = dureeDeLaVisite(v, planning.durees);
      g.dureeMin += duree;
      const clef = `${key}|${v.soignanteId}`;
      parSoignante.set(clef, (parSoignante.get(clef) ?? 0) + duree);
      g.chargeMaxMin = Math.max(g.chargeMaxMin, parSoignante.get(clef)!);
      if (v.statut === "faite") g.faites += 1;
      if (v.statut === "prevue") g.restantes += 1;
    }
    const list = Array.from(map.values());
    for (const g of list) g.termine = g.restantes === 0;
    list.sort((a, b) => a.ordre - b.ordre);
    return list;
  }, [items, parTranche, planning]);

  const flatItems = useMemo<FlatItem[]>(() => {
    const flat: FlatItem[] = [];
    for (const g of groupes) {
      flat.push({ type: "entete", groupe: g });
      const expanded = overrides[g.key] ?? !g.termine;
      if (expanded) {
        for (const v of g.visites) flat.push({ type: "visite", visite: v, groupeId: g.key });
      }
    }
    return flat;
  }, [groupes, overrides]);

  const virtualizer = useWindowVirtualizer({
    count: flatItems.length,
    estimateSize: (i) => {
      const item = flatItems[i];
      if (item.type === "entete") return parTranche ? 56 : 40;
      return item.visite.statut === "prevue" ? 118 : 74; // une visite à faire porte en plus sa rangée d'actions rapides
    },
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // Vue « Journée » : on ouvre sur la première tranche qui a encore des visites à faire.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!parTranche || scrolled.current || heure === null) return;
    const premiere = flatItems.findIndex((it) => it.type === "entete" && !it.groupe.termine);
    scrolled.current = true;
    if (premiere > 0) virtualizer.scrollToIndex(premiere, { align: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heure, parTranche, flatItems]);

  const apercu = useMemo(() => agregerParTranche(items, planning.durees), [items, planning]);

  /** Fait défiler jusqu'à la tranche (en la dépliant si besoin). */
  function voirTranche(tranche: Tranche) {
    const groupe = groupes.find((g) => g.tranche === tranche);
    if (!groupe) return;
    const index = flatItems.findIndex((it) => it.type === "entete" && it.groupe.key === groupe.key);
    if (!(overrides[groupe.key] ?? !groupe.termine)) setOverrides((prev) => ({ ...prev, [groupe.key]: true }));
    // Après dépliage, la ligne reste à la même position : l'en-tête est toujours avant ses visites.
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
  }

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

  async function handleMarquer(visiteId: string, statut: "faite" | "absent") {
    const current = items.find((v) => v.id === visiteId);
    if (!current) return;
    const previous = current.statut;

    // Pas de validation sans acte : on demande d'abord les actes réalisés.
    if (statut === "faite" && current.actes.length === 0) {
      setActesRequis(current);
      return;
    }
    // Puis, s'il y a des traitements prévus à ce passage, leur prise.
    if (statut === "faite" && traitementsSansReponse(current.traitementsDus, [], current.prises).length > 0) {
      setTraitementsRequis({ visite: current });
      return;
    }

    setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut } : v)));
    if (statut === "faite") {
      setUndo({ visiteId, previous });
    }

    let res;
    try {
      res = await marquerVisiteAction(visiteId, statut);
    } catch (e) {
      // Pas de réseau : on garde l'action sur l'appareil (si le mode hors-ligne est activé) pour l'envoyer ensuite.
      if (await mettreEnFileSiHorsLigne(e, nouvelleOperation({ visiteId, statutConnu: previous }, { type: "marquer", statut }))) return;
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
      setUndo(null);
      setInfo("Pas de réseau : l'action n'a pas été enregistrée.");
      return;
    }
    if (!res.ok) {
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
      setUndo(null);
      setInfo(res.error);
    }
  }

  /** Réseau absent + mode hors-ligne activé : l'opération est mise en file chiffrée. Renvoie true si prise en charge. */
  async function mettreEnFileSiHorsLigne(erreur: unknown, op: OperationHorsLigne): Promise<boolean> {
    if (!reseauIndisponible(erreur) || !horsLigneActive()) return false;
    try {
      await mettreEnFile(current.id, op);
      setInfo("Pas de réseau : enregistré sur l'appareil, il sera envoyé automatiquement.");
      return true;
    } catch {
      return false;
    }
  }

  /** Validation depuis la feuille « actes requis » : actes + statut enregistrés ensemble. */
  async function handleValiderAvecActes(
    visite: VisiteLigne,
    actes: string[] | undefined,
    prises?: PriseSaisie[]
  ): Promise<string | null> {
    // Des traitements sont prévus à ce passage et pas encore renseignés : on les demande avant de valider.
    if (prises === undefined && traitementsSansReponse(visite.traitementsDus, [], visite.prises).length > 0) {
      setActesRequis(null);
      setTraitementsRequis({ visite, actes });
      return null;
    }
    const maj = (v: VisiteLigne): VisiteLigne => ({ ...v, statut: "faite", actes: actes ?? v.actes, prises: prises ?? v.prises });
    let res;
    try {
      res = await marquerVisiteAction(visite.id, "faite", actes, prises);
    } catch (e) {
      const op = nouvelleOperation({ visiteId: visite.id, statutConnu: visite.statut }, { type: "marquer", statut: "faite", actes, prises });
      if (await mettreEnFileSiHorsLigne(e, op)) {
        setItems((prev) => prev.map((v) => (v.id === visite.id ? maj(v) : v)));
        setActesRequis(null);
        setTraitementsRequis(null);
        return null;
      }
      return "Pas de réseau : l'action n'a pas été enregistrée.";
    }
    if (!res.ok) return res.error;
    setItems((prev) => prev.map((v) => (v.id === visite.id ? maj(v) : v)));
    setUndo({ visiteId: visite.id, previous: visite.statut });
    setActesRequis(null);
    setTraitementsRequis(null);
    router.refresh();
    return null;
  }

  async function handleReporter(visiteId: string) {
    const current = items.find((v) => v.id === visiteId);
    if (!current) return;
    const previous = current.statut;
    setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: "reportee" } : v)));
    let res;
    try {
      res = await decalerVisiteAction(visiteId);
    } catch (e) {
      if (await mettreEnFileSiHorsLigne(e, nouvelleOperation({ visiteId, statutConnu: previous }, { type: "decaler" }))) return;
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
      setInfo("Pas de réseau : le report n'a pas été enregistré.");
      return;
    }
    if (!res.ok) {
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, statut: previous } : v)));
      setInfo(res.error);
      return;
    }
    setInfo(
      res.data.creee
        ? "Visite reportée à demain (même tranche)."
        : "Visite reportée : une visite existait déjà demain sur cette tranche."
    );
  }

  async function handleArrivee(visiteId: string) {
    const maintenant = new Date();
    const marquer = (heureArrivee: Date | null) =>
      setItems((prev) => prev.map((v) => (v.id === visiteId ? { ...v, heureArrivee } : v)));
    marquer(maintenant);
    let res;
    try {
      res = await marquerArriveeAction(visiteId);
    } catch (e) {
      if (await mettreEnFileSiHorsLigne(e, nouvelleOperationRapide(visiteId, { type: "arrivee" }))) return;
      marquer(null);
      setInfo("Pas de réseau : l'arrivée n'a pas été enregistrée.");
      return;
    }
    if (!res.ok) {
      marquer(null);
      setInfo(res.error);
    }
  }

  async function handleDeplacer(visiteId: string, sens: "haut" | "bas") {
    setItems((prev) => deplacerParmiLaTranche(prev, visiteId, sens));
    let res;
    try {
      res = await deplacerVisiteAction(visiteId, sens);
    } catch (e) {
      if (await mettreEnFileSiHorsLigne(e, nouvelleOperationRapide(visiteId, { type: "deplacer", sens }))) return;
      setItems(visitesInitiales);
      setInfo("Pas de réseau : l'ordre n'a pas été enregistré.");
      return;
    }
    if (!res.ok) {
      setItems(visitesInitiales);
      setInfo(res.error);
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

          {parTranche && (
            <ApercuJournee
              tranches={apercu}
              heure={heure}
              capaciteMin={planning.capaciteTrancheMin}
              onVoir={voirTranche}
              onAjouter={(t) => {
                setTrancheImposee(t);
                setNouvelleVisiteOpen(true);
              }}
            />
          )}

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
            description={`Pas de passage ${passage === "jour" ? "" : passage + " "}prévu${vue === "mine" ? " pour toi" : ""} aujourd'hui.`}
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
                  {item.type === "entete" ? (
                    <EnteteGroupe
                      groupe={item.groupe}
                      etat={
                        item.groupe.tranche
                          ? etatTranche(item.groupe.tranche, item.groupe.restantes, heure)
                          : null
                      }
                      capaciteMin={planning.capaciteTrancheMin}
                      expanded={overrides[item.groupe.key] ?? !item.groupe.termine}
                      onToggle={() => {
                        const key = item.groupe.key;
                        setOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? !item.groupe.termine) }));
                      }}
                    />
                  ) : (
                    <VisiteCard
                      visite={item.visite}
                      vue={vue}
                      onMarquer={(statut) => handleMarquer(item.visite.id, statut)}
                      onReporter={() => handleReporter(item.visite.id)}
                      onOptions={() => setVisiteActions(item.visite)}
                      onArrivee={() => handleArrivee(item.visite.id)}
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
        durees={planning.durees}
        open={nouvelleVisiteOpen}
        onClose={() => {
          setNouvelleVisiteOpen(false);
          setTrancheImposee(null);
        }}
        date={date}
        defaultTranche={trancheImposee}
        onCree={setInfo}
      />

      <ActesRequisSheet
        visite={actesRequis}
        onClose={() => setActesRequis(null)}
        onValider={handleValiderAvecActes}
      />

      <TraitementsSheet
        titre={traitementsRequis ? `${traitementsRequis.visite.patientPrenom} ${traitementsRequis.visite.patientNom}` : null}
        traitements={traitementsRequis?.visite.traitementsDus ?? []}
        initiales={traitementsRequis?.visite.prises ?? []}
        onClose={() => setTraitementsRequis(null)}
        onConfirmer={(prises) =>
          traitementsRequis
            ? handleValiderAvecActes(traitementsRequis.visite, traitementsRequis.actes, prises)
            : "Validation impossible."
        }
      />

      <VisiteActionsSheet
        durees={planning.durees}
        visite={visiteActions}
        onClose={() => setVisiteActions(null)}
        onDone={setInfo}
        onDeplacer={(v, sens) => {
          setVisiteActions(null);
          void handleDeplacer(v.id, sens);
        }}
        onTransferer={(v) => {
          setVisiteActions(null);
          setTransfert([
            { libelle: "Cette visite seulement", cible: { type: "visite", id: v.id } },
            ...(v.serieId
              ? [
                  {
                    libelle: "Toute la série (visites à venir)",
                    cible: { type: "serie" as const, id: v.serieId },
                  },
                ]
              : []),
            {
              libelle: `Tout ce qu'il me reste pour ${v.patientPrenom} ${v.patientNom}`,
              cible: { type: "patient" as const, id: v.patientId },
            },
          ]);
        }}
      />

      <TransfertSheet
        titre="Transférer"
        choix={transfert}
        onClose={() => setTransfert(null)}
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

/** Temps prévu de la tranche ; en rouge quand une soignante dépasse la capacité. */
function ChargeTranche({ groupe, capaciteMin }: { groupe: Groupe; capaciteMin: number }) {
  if (groupe.dureeMin <= 0) return null;
  const etat = etatCharge(groupe.chargeMaxMin, capaciteMin);
  return (
    <span className={`text-[11px] ${CHARGE[etat]}`}>
      {formaterDuree(groupe.dureeMin)} prévues
      {etat === "depasse" ? ` · dépasse ${formaterDuree(capaciteMin)}` : ""}
    </span>
  );
}

const ETAT_TRANCHE: Record<EtatTranche, { label: string; point: string; texte: string }> = {
  terminee: { label: "Terminée", point: "bg-statut-faite", texte: "text-statut-faite" },
  en_cours: { label: "En cours", point: "bg-coral", texte: "text-coral" },
  en_retard: { label: "En retard", point: "bg-statut-absent", texte: "text-statut-absent" },
  a_venir: { label: "À venir", point: "bg-pine/25", texte: "text-pine/50" },
};

const CHARGE: Record<EtatCharge, string> = {
  vide: "text-pine/45",
  ok: "text-pine/55",
  proche: "text-statut-reportee",
  depasse: "font-semibold text-statut-absent",
};

function EnteteGroupe({
  groupe,
  etat,
  capaciteMin,
  expanded,
  onToggle,
}: {
  groupe: Groupe;
  etat: EtatTranche | null;
  capaciteMin: number;

  expanded: boolean;
  onToggle: () => void;
}) {
  // Vue « Journée » : en-tête de tranche avec compteur et état visuel.
  if (etat && groupe.tranche) {
    const visuel = ETAT_TRANCHE[etat];
    return (
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${
          etat === "en_cours" ? "bg-coral/10 ring-1 ring-coral/30" : "bg-pine/5"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${visuel.point}`} aria-hidden />
          <span className="flex flex-col">
            <span className="font-serif text-base font-semibold leading-tight text-pine">
              {INFOS_TRANCHE[groupe.tranche].label}
            </span>
            <span className={`text-[11px] font-semibold ${visuel.texte}`}>{visuel.label}</span>
            <ChargeTranche groupe={groupe} capaciteMin={capaciteMin} />
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-statut-faite/10 px-2 py-0.5 font-semibold text-statut-faite">
            {groupe.faites} faite{groupe.faites > 1 ? "s" : ""}
          </span>
          <span className="rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine/70">
            {groupe.restantes} à faire
          </span>
          <ChevronDown size={16} className={`text-pine/40 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </span>
      </button>
    );
  }

  if (groupe.termine && !expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-2 text-sm text-pine/50"
      >
        <span>
          {groupe.titre} — {groupe.faites}/{groupe.total} ✓
        </span>
        <ChevronDown size={16} className="-rotate-90" />
      </button>
    );
  }

  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-1 py-2">
      <span className="text-sm font-semibold text-pine">
        {groupe.titre}{" "}
        <span className="font-normal text-pine/40">
          {groupe.faites}/{groupe.total}
        </span>
        {groupe.dureeMin > 0 && <span className="font-normal text-pine/40"> · {formaterDuree(groupe.dureeMin)}</span>}
      </span>
      <ChevronDown size={16} className={`text-pine/40 transition-transform ${expanded ? "" : "-rotate-90"}`} />
    </button>
  );
}
