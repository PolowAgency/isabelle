"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, Clock, AlertCircle, DoorOpen, MoreVertical, Navigation, Phone, X } from "lucide-react";
import type { VisiteLigne, VueTournee } from "@/lib/tournee";
import { libelleActe } from "@/lib/actes";
import { formaterDuree } from "@/lib/planning-calc";
import { lienAppel, lienGoogleMaps, lienWaze } from "@/lib/itineraire";

const STATUT_LABELS: Record<string, string> = {
  faite: "Faite",
  absent: "Absente",
  reportee: "Reportée",
  annulee: "Annulée",
};

const SWIPE_THRESHOLD = 72;
const MENU_OPEN_X = -136;

function formatHeure(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function VisiteCard({
  visite,
  vue,
  onMarquer,
  onReporter,
  onOptions,
  onArrivee,
}: {
  visite: VisiteLigne;
  vue: VueTournee;
  onMarquer: (statut: "faite" | "absent") => void;
  /** Décale la visite à demain (même tranche). */
  onReporter: () => void;
  onOptions?: () => void;
  /** « Je suis arrivée » : enregistre l'heure d'arrivée chez le patient. */
  onArrivee?: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const menuOpenAtStart = useRef(false);
  const moved = useRef(false);

  const done = visite.statut !== "prevue";
  const alerte = !done && (visite.transmissionNonLue || visite.ordonnanceAlerte);
  const heure = formatHeure(visite.heureReelle);

  function handlePointerDown(e: React.PointerEvent) {
    if (done) return;
    startX.current = e.clientX;
    menuOpenAtStart.current = menuOpen;
    moved.current = false;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || startX.current === null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 4) moved.current = true;
    const base = menuOpenAtStart.current ? MENU_OPEN_X : 0;
    setDragX(Math.max(-160, Math.min(100, base + delta)));
  }

  // Pas de gestionnaire onClick séparé : un clic natif suit toujours un
  // relâchement souris (même après un glissement important), et fermerait
  // aussitôt le menu qu'on vient d'ouvrir. Tout se décide ici, dans le
  // même cycle pointerdown/pointerup.
  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    startX.current = null;

    if (menuOpenAtStart.current && !moved.current) {
      setMenuOpen(false);
      setDragX(0);
      return;
    }

    if (menuOpen || menuOpenAtStart.current) {
      if (dragX > MENU_OPEN_X + 40) {
        setMenuOpen(false);
        setDragX(0);
      } else {
        setDragX(MENU_OPEN_X);
      }
      return;
    }

    if (dragX > SWIPE_THRESHOLD) {
      onMarquer("faite");
      setDragX(0);
    } else if (dragX < -SWIPE_THRESHOLD) {
      setMenuOpen(true);
      setDragX(MENU_OPEN_X);
    } else {
      setDragX(0);
    }
  }

  const adresseCourte = [visite.adresse].filter(Boolean).join(" ");
  const appel = lienAppel(visite.patientTelephone);
  const adresse = { adresse: visite.adresse, codePostal: visite.codePostal, ville: visite.ville };
  const maps = lienGoogleMaps(adresse);
  const waze = lienWaze(adresse);
  const arrivee = formatHeure(visite.heureArrivee);

  return (
    <div className="relative rounded-xl overflow-hidden select-none">
      {!done && (
        <div className="absolute inset-0 flex items-stretch">
          <div
            className="flex items-center bg-statut-faite px-5 transition-opacity"
            style={{ opacity: dragX > 8 ? 1 : 0 }}
          >
            <Check className="text-white" size={22} />
          </div>
          <div className="flex-1" />
          {(dragX < -8 || menuOpen) && (
            <div className="flex items-center gap-2 bg-transparent px-2">
              <button
                onClick={() => {
                  onMarquer("absent");
                  setMenuOpen(false);
                  setDragX(0);
                }}
                className="h-full px-3 rounded-lg bg-statut-absent text-white text-xs font-medium whitespace-nowrap"
              >
                Absent
              </button>
              <button
                onClick={() => {
                  onReporter();
                  setMenuOpen(false);
                  setDragX(0);
                }}
                className="h-full px-3 rounded-lg bg-statut-reportee text-white text-xs font-medium whitespace-nowrap"
              >
                À demain
              </button>
            </div>
          )}
        </div>
      )}

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
        }}
        className={`relative flex flex-col bg-card rounded-xl px-3.5 py-2.5 min-h-[56px] touch-pan-y ${
          done ? "opacity-55" : ""
        }`}
      >
        <div className="flex items-center gap-2.5">
        {vue === "equipe" && (
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: visite.soignanteCouleur }}
            aria-hidden
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/patients/${visite.patientId}`}
              className="min-w-0 flex-1 truncate text-sm font-medium text-pine underline-offset-4 hover:underline"
            >
              {visite.patientPrenom} {visite.patientNom}
              {adresseCourte && (
                <span className="font-normal text-pine/50"> · {adresseCourte}</span>
              )}
            </Link>

          </div>
          <p className="text-xs text-pine/50 truncate">
            {visite.actes.map(libelleActe).join(" · ") || "—"}
            {visite.dureeEstimeeMin ? ` · ${formaterDuree(visite.dureeEstimeeMin)}` : ""}
          </p>
          {(vue === "equipe" || done) && (
            <p className="mt-0.5 text-[11px] text-pine/45 truncate">
              {vue === "equipe" ? `${visite.soignantePrenom}` : "Suivi"}
              {done ? ` · ${STATUT_LABELS[visite.statut] ?? visite.statut}` : ""}
              {heure ? ` · ${heure}` : ""}
            </p>
          )}
        </div>

        {(!done || visite.statut === "faite") && onOptions && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOptions}
            aria-label={`Modifier la visite de ${visite.patientPrenom} ${visite.patientNom}`}
            className="inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-full text-pine/40"
          >
            <MoreVertical size={18} />
          </button>
        )}
        {alerte && <AlertCircle size={18} className="text-coral shrink-0" aria-label="Alerte" />}
        {!done && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMarquer("faite")}
            aria-label={`Marquer la visite de ${visite.patientPrenom} ${visite.patientNom} comme faite`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-statut-faite/40 text-statut-faite active:bg-statut-faite active:text-white"
          >
            <Check size={20} />
          </button>
        )}
        {visite.statut === "faite" && <Check size={18} className="text-statut-faite shrink-0" />}
        {visite.statut === "absent" && <X size={18} className="text-statut-absent shrink-0" />}
        {visite.statut === "reportee" && <Clock size={18} className="text-statut-reportee shrink-0" />}
        </div>

        {!done && (
          <div className="mt-2 flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
            <ActionRapide href={appel} icone={Phone} libelle="Appeler" />
            <ActionRapide href={maps} icone={Navigation} libelle="Itinéraire" externe />
            <ActionRapide href={waze} icone={Navigation} libelle="Waze" externe />
            {onArrivee && (
              <button
                type="button"
                onClick={onArrivee}
                disabled={Boolean(visite.heureArrivee)}
                aria-label={`Je suis arrivée chez ${visite.patientPrenom} ${visite.patientNom}`}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border border-pine/20 px-2.5 text-xs font-medium text-pine disabled:border-statut-faite/40 disabled:text-statut-faite"
              >
                <DoorOpen size={14} />
                {arrivee ? `Arrivée ${arrivee}` : "Je suis arrivée"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionRapide({
  href,
  icone: Icone,
  libelle,
  externe = false,
}: {
  href: string | null;
  icone: typeof Phone;
  libelle: string;
  externe?: boolean;
}) {
  const classe =
    "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium";
  if (!href) {
    return (
      <span className={`${classe} border-line text-pine/30`} aria-disabled="true">
        <Icone size={14} />
        {libelle}
      </span>
    );
  }
  return (
    <a
      href={href}
      target={externe ? "_blank" : undefined}
      rel={externe ? "noreferrer" : undefined}
      className={`${classe} border-pine/20 text-pine`}
    >
      <Icone size={14} />
      {libelle}
    </a>
  );
}
