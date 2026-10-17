"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import {
  enregistrerServiceWorker,
  precacherCoquille,
  rafraichir,
} from "@/lib/offline/client";
import { EVENEMENT_FILE, synchroniser, type BilanSynchronisation } from "@/lib/offline/file";
import { compterFile, horsLigneActive } from "@/lib/offline/stockage";

const INTERVALLE_MS = 30 * 60 * 1000;

/**
 * Invisible sauf besoin : enregistre le service worker, garde l'instantané du jour à
 * jour tant que le réseau est là (si le mode hors-ligne est activé sur cet appareil),
 * envoie les actions faites hors-ligne dès que le réseau revient, et signale l'état.
 */
export function OfflineManager({ soignanteId }: { soignanteId: string }) {
  const [enLigne, setEnLigne] = useState(true);
  const [actif, setActif] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [session, setSession] = useState(false);
  const [conflits, setConflits] = useState<string[]>([]);
  const dernier = useRef(0);

  const compter = useCallback(async () => {
    try {
      setEnAttente(await compterFile(soignanteId));
    } catch {
      setEnAttente(0);
    }
  }, [soignanteId]);

  const maj = useCallback(
    async (force = false) => {
      if (!horsLigneActive() || !navigator.onLine) return;
      if (!force && Date.now() - dernier.current < 60_000) return;
      dernier.current = Date.now();
      const { bilan, telechargement } = await rafraichir(soignanteId);
      setSession(bilan.etat === "session" || telechargement.etat === "session");
      if (bilan.etat === "ok" && bilan.conflits.length > 0) {
        setConflits(bilan.conflits.map((c) => c.message ?? "Une action hors-ligne n'a pas pu être appliquée."));
      }
      await compter();
    },
    [soignanteId, compter]
  );

  useEffect(() => {
    setEnLigne(navigator.onLine);
    setActif(horsLigneActive());
    void enregistrerServiceWorker();
    void compter();
    if (horsLigneActive()) {
      void precacherCoquille();
      void maj(true);
    }

    const surReseau = () => {
      setEnLigne(navigator.onLine);
      if (navigator.onLine) void maj(true);
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void maj();
    };
    const surFile = () => void compter();

    window.addEventListener("online", surReseau);
    window.addEventListener("offline", surReseau);
    window.addEventListener(EVENEMENT_FILE, surFile);
    document.addEventListener("visibilitychange", surVisibilite);
    const timer = setInterval(() => void maj(), INTERVALLE_MS);
    return () => {
      window.removeEventListener("online", surReseau);
      window.removeEventListener("offline", surReseau);
      window.removeEventListener(EVENEMENT_FILE, surFile);
      document.removeEventListener("visibilitychange", surVisibilite);
      clearInterval(timer);
    };
  }, [maj, compter]);

  async function envoyerMaintenant() {
    const bilan: BilanSynchronisation = await synchroniser(soignanteId);
    if (bilan.etat === "session") setSession(true);
    await compter();
  }

  const aAfficher = (!enLigne && actif) || enAttente > 0 || conflits.length > 0 || session;
  if (!aAfficher) return null;

  return (
    <div className="fixed inset-x-3 bottom-[4.6rem] z-30 flex flex-col gap-2 print:hidden">
      {!enLigne && actif && (
        <a
          href="/hors-ligne"
          className="flex items-center gap-2 rounded-2xl bg-pine px-4 py-3 text-sm font-medium text-cream shadow-card"
        >
          <CloudOff size={16} /> Pas de réseau — ouvrir la tournée hors-ligne
        </a>
      )}
      {enAttente > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-medium text-white shadow-card">
          <span>
            {enAttente} action{enAttente > 1 ? "s" : ""} en attente d&apos;envoi
          </span>
          {enLigne && (
            <button type="button" onClick={envoyerMaintenant} className="inline-flex items-center gap-1 font-semibold underline">
              <RefreshCw size={14} /> Envoyer
            </button>
          )}
        </div>
      )}
      {session && (
        <a href="/login" className="rounded-2xl bg-statut-absent px-4 py-3 text-sm font-medium text-white shadow-card">
          Session expirée : reconnectez-vous pour envoyer vos actions.
        </a>
      )}
      {conflits.map((message, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setConflits((c) => c.filter((_, j) => j !== i))}
          className="rounded-2xl bg-statut-reportee px-4 py-3 text-left text-sm font-medium text-white shadow-card"
        >
          {message} <span className="underline">OK</span>
        </button>
      ))}
    </div>
  );
}
