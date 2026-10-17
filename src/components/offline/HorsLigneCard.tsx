"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { precacherCoquille, enregistrerServiceWorker, telechargerInstantane } from "@/lib/offline/client";
import {
  compterFile,
  definirHorsLigne,
  horsLigneActive,
  lireInstantane,
  purgerDonneesLocales,
} from "@/lib/offline/stockage";

/** Activation explicite du mode hors-ligne sur CET appareil (consentement), et purge. */
export function HorsLigneCard({ soignanteId }: { soignanteId: string }) {
  const [actif, setActif] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [enAttente, setEnAttente] = useState(0);

  const lireEtat = useCallback(async () => {
    setActif(horsLigneActive());
    setEnAttente(await compterFile(soignanteId).catch(() => 0));
    const instantane = await lireInstantane(soignanteId).catch(() => null);
    setInfo(
      instantane
        ? `Dernière mise à jour : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(instantane.genereLe)} · ${instantane.visites.length} visite${instantane.visites.length > 1 ? "s" : ""}`
        : null
    );
  }, [soignanteId]);

  useEffect(() => {
    void lireEtat();
  }, [lireEtat]);

  async function activer() {
    setOccupe(true);
    setErreur(null);
    try {
      await enregistrerServiceWorker();
      const resultat = await telechargerInstantane(soignanteId);
      if (resultat.etat !== "ok") {
        setErreur(
          resultat.etat === "session"
            ? "Session expirée : reconnectez-vous."
            : "Impossible de télécharger les données (pas de réseau ?)."
        );
        return;
      }
      definirHorsLigne(true);
      await precacherCoquille();
      await lireEtat();
    } finally {
      setOccupe(false);
    }
  }

  async function desactiver() {
    setOccupe(true);
    definirHorsLigne(false);
    await purgerDonneesLocales();
    await lireEtat();
    setOccupe(false);
  }

  return (
    <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-pine">
        <CloudOff size={18} />
        <h2 className="font-serif text-xl font-semibold">Mode hors-ligne</h2>
      </div>
      <p className="mb-3 text-sm text-pine/60">
        Garde sur <strong>cet appareil</strong> votre tournée du jour et les fiches des patients du jour (accès au
        domicile compris), <strong>chiffrées</strong>, pour travailler sans réseau. Les actions faites hors-ligne sont
        envoyées dès le retour du réseau, sans jamais écraser ce qu&apos;une collègue a enregistré. Les données sont
        effacées à la déconnexion et au bout de 24 h. Protégez l&apos;appareil par un code de verrouillage.
      </p>
      {actif ? (
        <>
          <p className="mb-1 text-sm font-medium text-statut-faite">Activé sur cet appareil.</p>
          {info && <p className="mb-1 text-xs text-pine/55">{info}</p>}
          {enAttente > 0 && (
            <p className="mb-2 text-xs text-coral">
              {enAttente} action{enAttente > 1 ? "s" : ""} hors-ligne pas encore envoyée{enAttente > 1 ? "s" : ""}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a href="/hors-ligne" className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-pine">
              Ouvrir la tournée hors-ligne
            </a>
            <button
              type="button"
              disabled={occupe}
              onClick={desactiver}
              className="rounded-full border border-statut-absent/40 px-4 py-2 text-sm font-semibold text-statut-absent disabled:opacity-60"
            >
              Désactiver et effacer
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={occupe}
          onClick={activer}
          className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {occupe ? "Téléchargement…" : "Activer sur cet appareil"}
        </button>
      )}
      {erreur && <p className="mt-2 text-sm text-statut-absent">{erreur}</p>}
    </section>
  );
}
