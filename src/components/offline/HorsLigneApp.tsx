"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Clock,
  CloudOff,
  KeyRound,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActesPicker } from "@/components/today/ActesPicker";
import { MESSAGE_ACTE_REQUIS, libelleActe } from "@/lib/actes";
import { formatDateLong, todayISO } from "@/lib/date";
import { rafraichir } from "@/lib/offline/client";
import { appliquerOperation } from "@/lib/offline/local";
import { EVENEMENT_FILE, mettreEnFile, nouvelleOperation } from "@/lib/offline/file";
import { compterFile, lireInstantane, sauverInstantane } from "@/lib/offline/stockage";
import { INFOS_TRANCHE, TRANCHES, etatTranche, estTranche, libelleTranche, type Tranche } from "@/lib/tranches";
import { heureParis } from "@/lib/date";
import type { FicheHL, InstantaneHL, VisiteHL } from "@/lib/offline/types";

const STATUTS: Record<string, { label: string; classe: string }> = {
  prevue: { label: "À faire", classe: "bg-pine/10 text-pine" },
  faite: { label: "Faite", classe: "bg-statut-faite text-white" },
  absent: { label: "Absente", classe: "bg-statut-absent text-white" },
  reportee: { label: "Reportée", classe: "bg-statut-reportee text-white" },
  annulee: { label: "Annulée", classe: "bg-pine/20 text-pine" },
};

function heure(iso: number) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(iso);
}

/** Tournée du jour lue sur l'appareil : consultation des fiches, validation, report, absence — sans réseau. */
export function HorsLigneApp() {
  const [instantane, setInstantane] = useState<InstantaneHL | null>(null);
  const [charge, setCharge] = useState(false);
  const [enLigne, setEnLigne] = useState(true);
  const [enAttente, setEnAttente] = useState(0);
  const [fiche, setFiche] = useState<FicheHL | null>(null);
  const [actesRequis, setActesRequis] = useState<VisiteHL | null>(null);
  const [actesChoisis, setActesChoisis] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [conflits, setConflits] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);

  const recharger = useCallback(async () => {
    const lu = await lireInstantane();
    setInstantane(lu);
    setEnAttente(lu ? await compterFile(lu.soignanteId) : await compterFile());
    setCharge(true);
  }, []);

  useEffect(() => {
    setEnLigne(navigator.onLine);
    void recharger();
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    window.addEventListener(EVENEMENT_FILE, recharger);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
      window.removeEventListener(EVENEMENT_FILE, recharger);
    };
  }, [recharger]);

  async function agir(
    visite: VisiteHL,
    action: { type: "marquer"; statut: "faite" | "absent"; actes?: string[] } | { type: "decaler" }
  ) {
    if (!instantane) return;
    const op = nouvelleOperation({ visiteId: visite.id, statutConnu: visite.statut }, action);
    await mettreEnFile(instantane.soignanteId, op);
    const suivant = appliquerOperation(instantane, op);
    await sauverInstantane(suivant);
    setInstantane(suivant);
    setMessage(
      enLigne
        ? "Enregistré, envoi en cours…"
        : "Enregistré sur l'appareil : sera envoyé dès le retour du réseau."
    );
    setEnAttente(await compterFile(instantane.soignanteId));
    if (navigator.onLine) void envoyer(instantane.soignanteId);
  }

  async function envoyer(soignanteId = instantane?.soignanteId) {
    if (!soignanteId) return;
    setOccupe(true);
    try {
      const { bilan } = await rafraichir(soignanteId);
      if (bilan.etat === "session") {
        setMessage("Session expirée : reconnectez-vous (vos actions sont conservées sur l'appareil).");
      } else if (bilan.etat === "ok") {
        setConflits(bilan.conflits.map((c) => c.message ?? "Une action n'a pas pu être appliquée."));
        setMessage(`${bilan.envoyees} action${bilan.envoyees > 1 ? "s" : ""} envoyée${bilan.envoyees > 1 ? "s" : ""}.`);
      }
      await recharger();
    } finally {
      setOccupe(false);
    }
  }

  function valider(visite: VisiteHL) {
    if (visite.actes.length === 0) {
      setActesChoisis([]);
      setActesRequis(visite);
      return;
    }
    void agir(visite, { type: "marquer", statut: "faite" });
  }

  const groupes = useMemo(() => {
    if (!instantane) return [];
    const maintenant = instantane.jour === todayISO() ? heureParis() : null;
    return TRANCHES.map((tranche) => {
      const visites = instantane.visites.filter((v) => v.tranche === tranche);
      const restantes = visites.filter((v) => v.statut === "prevue").length;
      return { tranche, visites, restantes, etat: etatTranche(tranche, restantes, maintenant) };
    }).filter((g) => g.visites.length > 0);
  }, [instantane]);

  if (!charge) return <p className="p-6 text-sm text-pine/60">Chargement…</p>;

  const periime = instantane && instantane.jour !== todayISO();

  return (
    <div className="min-h-dvh bg-cream pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 px-4 pb-3 pt-4 backdrop-blur-sm safe-top">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-pine">Tournée hors-ligne</h1>
            {instantane && (
              <p className="text-xs text-pine/55">
                <span className="capitalize">{formatDateLong(instantane.jour)}</span> · données de {heure(instantane.genereLe)}
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              enLigne ? "bg-statut-faite/10 text-statut-faite" : "bg-pine text-cream"
            }`}
          >
            <CloudOff size={13} /> {enLigne ? "Réseau OK" : "Hors-ligne"}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <a href="/" className="inline-flex items-center gap-1 text-sm font-medium text-coral">
            <ChevronLeft size={16} /> Application
          </a>
          {enAttente > 0 && (
            <button
              type="button"
              disabled={!enLigne || occupe}
              onClick={() => void envoyer()}
              className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={occupe ? "animate-spin" : ""} />
              {enAttente} à envoyer
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-col gap-3 px-4 pt-3">
        {message && (
          <p className="rounded-xl bg-pine/5 px-3 py-2 text-sm text-pine" role="status">
            {message}
          </p>
        )}
        {conflits.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setConflits((l) => l.filter((_, j) => j !== i))}
            className="flex items-start gap-2 rounded-xl bg-statut-reportee px-3 py-2 text-left text-sm font-medium text-white"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {c} <span className="underline">OK</span>
            </span>
          </button>
        ))}

        {!instantane && (
          <div className="rounded-2xl border border-line/80 bg-card p-5 text-sm text-pine/70">
            <p className="font-semibold text-pine">Aucune donnée hors-ligne sur cet appareil.</p>
            <p className="mt-1">
              Avec du réseau, activez « Mode hors-ligne » dans <strong>Compte</strong> : la tournée du jour et les
              fiches utiles seront conservées sur l&apos;appareil, chiffrées.
            </p>
          </div>
        )}

        {periime && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Ces données datent du <span className="capitalize">{formatDateLong(instantane!.jour)}</span>, pas
            d&apos;aujourd&apos;hui : reconnectez-vous au réseau pour les mettre à jour.
          </p>
        )}

        {instantane && groupes.length === 0 && <p className="text-sm text-pine/55">Aucune visite prévue ce jour-là.</p>}

        {groupes.map((g) => (
          <section key={g.tranche} className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-xl bg-pine/5 px-3 py-2">
              <span className="font-serif text-base font-semibold text-pine">{INFOS_TRANCHE[g.tranche].label}</span>
              <span className="text-xs font-semibold text-pine/60">{g.restantes} à faire</span>
            </div>
            {g.visites.map((v) => (
              <div key={v.id} className="rounded-xl bg-card px-3.5 py-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setFiche(instantane!.fiches[v.patientId] ?? null)}
                    className="min-w-0 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-pine underline-offset-4 hover:underline">
                      {v.patientPrenom} {v.patientNom}
                    </p>
                    <p className="truncate text-xs text-pine/55">
                      {[v.adresse, v.ville].filter(Boolean).join(", ") || "Adresse non renseignée"}
                    </p>
                    <p className="truncate text-xs text-pine/50">
                      {v.actes.map(libelleActe).join(" · ") || "—"}
                    </p>
                  </button>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUTS[v.statut].classe}`}>
                    {STATUTS[v.statut].label}
                  </span>
                </div>
                {v.statut === "prevue" && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => valider(v)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-statut-faite py-2 text-sm font-semibold text-white"
                    >
                      <Check size={16} /> Faite
                    </button>
                    <button
                      type="button"
                      onClick={() => void agir(v, { type: "marquer", statut: "absent" })}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-statut-absent/40 px-3 py-2 text-sm font-semibold text-statut-absent"
                    >
                      <X size={16} /> Absent
                    </button>
                    <button
                      type="button"
                      onClick={() => void agir(v, { type: "decaler" })}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-statut-reportee/50 px-3 py-2 text-sm font-semibold text-statut-reportee"
                    >
                      <Clock size={16} /> À demain
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </main>

      <BottomSheet open={actesRequis !== null} onClose={() => setActesRequis(null)} title={actesRequis ? `${actesRequis.patientPrenom} ${actesRequis.patientNom}` : undefined}>
        <div className="flex flex-col gap-4 pb-2">
          <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {MESSAGE_ACTE_REQUIS} Quels actes avez-vous réalisés ?
          </p>
          <ActesPicker value={actesChoisis} onChange={setActesChoisis} />
          <button
            type="button"
            disabled={actesChoisis.length === 0}
            onClick={() => {
              if (!actesRequis) return;
              void agir(actesRequis, { type: "marquer", statut: "faite", actes: actesChoisis });
              setActesRequis(null);
            }}
            className="rounded-xl bg-statut-faite py-3 text-base font-medium text-white disabled:opacity-50"
          >
            Valider la visite
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={fiche !== null} onClose={() => setFiche(null)} title={fiche ? `${fiche.prenom} ${fiche.nom}` : undefined}>
        {fiche && <FicheHorsLigne fiche={fiche} />}
      </BottomSheet>
    </div>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string | null }) {
  if (!valeur) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-pine/55">{label}</span>
      <span className="text-right font-medium text-ink">{valeur}</span>
    </div>
  );
}

function FicheHorsLigne({ fiche }: { fiche: FicheHL }) {
  const adresse = [fiche.adresse, fiche.complementAdresse, fiche.codePostal, fiche.ville].filter(Boolean).join(", ");
  const a = fiche.acces;
  return (
    <div className="flex flex-col gap-4 pb-2">
      <section className="flex flex-col gap-1.5">
        {fiche.telephone && (
          <a href={`tel:${fiche.telephone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-2 text-sm font-semibold text-coral">
            <Phone size={15} /> {fiche.telephone}
          </a>
        )}
        <Ligne label="Adresse" valeur={adresse || null} />
        <Ligne
          label="Médecin"
          valeur={fiche.medecinTraitantNom ? `${fiche.medecinTraitantNom}${fiche.medecinTraitantTelephone ? ` · ${fiche.medecinTraitantTelephone}` : ""}` : null}
        />
        <Ligne
          label="Contact d'urgence"
          valeur={
            fiche.contactUrgenceNom
              ? [fiche.contactUrgenceNom, fiche.contactUrgenceLien ? `(${fiche.contactUrgenceLien})` : null, fiche.contactUrgenceTelephone]
                  .filter(Boolean)
                  .join(" ")
              : null
          }
        />
      </section>

      <section className="flex flex-col gap-1.5 rounded-2xl bg-cream px-3.5 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-pine/55">
          <KeyRound size={14} /> Accès au domicile
        </p>
        <Ligne label="Portail" valeur={a.codePortail} />
        <Ligne label="Immeuble" valeur={a.codeImmeuble} />
        <Ligne label="Étage" valeur={a.etage} />
        <Ligne label="Digicode" valeur={a.digicodePorte} />
        <Ligne label="Clé" valeur={a.emplacementCle} />
        <Ligne label="Animal" valeur={a.presenceAnimal ? a.descriptionAnimal || "Présent" : null} />
        <Ligne label="Aidant" valeur={a.detailsAidant} />
        <Ligne label="Stationnement" valeur={a.stationnement} />
        <Ligne label="Notes" valeur={a.notesAcces} />
      </section>

      {fiche.traitements.length > 0 && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-pine/55">Traitements</p>
          <ul className="flex flex-col gap-1 text-sm text-ink">
            {fiche.traitements.map((t, i) => (
              <li key={i}>
                {t.libelle}
                {t.dosage ? ` · ${t.dosage}` : ""}
                {t.passages.length ? ` (${t.passages.join(", ")})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fiche.transmissions.length > 0 && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-pine/55">Dernières transmissions</p>
          <ul className="flex flex-col gap-2">
            {fiche.transmissions.map((t, i) => (
              <li key={i} className="rounded-xl bg-cream px-3 py-2 text-sm text-ink">
                {t.importance === "urgent" && <span className="mr-1 font-semibold text-coral">Urgent ·</span>}
                {t.contenu}
                <span className="mt-0.5 block text-xs text-pine/45">
                  {t.auteur} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(t.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fiche.prochaines.length > 0 && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-pine/55">Prochaines visites</p>
          <ul className="text-sm text-ink">
            {fiche.prochaines.map((v, i) => (
              <li key={i}>
                <span className="capitalize">{formatDateLong(v.date)}</span>
                {estTranche(v.tranche) ? ` · ${libelleTranche(v.tranche as Tranche)}` : ""}
                {v.actes.length ? ` · ${v.actes.map(libelleActe).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
