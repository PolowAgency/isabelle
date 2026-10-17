"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";

const CLE_PUBLIQUE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function cleVersUint8(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);
  const sortie = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) sortie[i] = brut.charCodeAt(i);
  return sortie;
}

type Etat =
  | { type: "chargement" }
  | { type: "indisponible"; raison: string }
  | { type: "inactif" }
  | { type: "actif"; transferts: boolean; urgences: boolean };

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * Notifications push : consentement explicite par appareil (permission du navigateur,
 * déclenchée par un clic). Le texte des notifications ne contient jamais de donnée médicale.
 */
export function NotificationsCard() {
  const [etat, setEtat] = useState<Etat>({ type: "chargement" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const lireEtat = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setEtat({ type: "indisponible", raison: "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord l'appli à l'écran d'accueil." });
    }
    if (!CLE_PUBLIQUE) return setEtat({ type: "indisponible", raison: "Les notifications ne sont pas encore configurées sur ce serveur." });
    if (process.env.NODE_ENV !== "production") return setEtat({ type: "indisponible", raison: "Indisponible en développement." });
    if (Notification.permission === "denied") {
      return setEtat({ type: "indisponible", raison: "Notifications bloquées dans les réglages du navigateur pour ce site." });
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.getSubscription();
      if (!abonnement) return setEtat({ type: "inactif" });
      const reponse = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(abonnement.endpoint)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const donnees = reponse.ok ? await reponse.json() : { abonne: false };
      setEtat(
        donnees.abonne
          ? { type: "actif", transferts: donnees.notifierTransferts, urgences: donnees.notifierUrgences }
          : { type: "inactif" }
      );
    } catch {
      setEtat({ type: "inactif" });
    }
  }, []);

  useEffect(() => {
    void lireEtat();
  }, [lireEtat]);

  async function enregistrer(abonnement: PushSubscription, transferts: boolean, urgences: boolean) {
    const json = abonnement.toJSON();
    const reponse = await fetch("/api/push/subscription", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({
        endpoint: abonnement.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        notifierTransferts: transferts,
        notifierUrgences: urgences,
      }),
    });
    if (!reponse.ok) throw new Error((await reponse.json().catch(() => null))?.error ?? "Activation impossible.");
  }

  async function activer() {
    setOccupe(true);
    setErreur(null);
    try {
      // La permission n'est demandée qu'ici, suite à un clic.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setErreur("Permission refusée : les notifications restent désactivées.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const abonnement =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersUint8(CLE_PUBLIQUE) }));
      await enregistrer(abonnement, true, true);
      await lireEtat();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Activation impossible.");
    } finally {
      setOccupe(false);
    }
  }

  async function majPreferences(transferts: boolean, urgences: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.getSubscription();
      if (abonnement) await enregistrer(abonnement, transferts, urgences);
      await lireEtat();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Mise à jour impossible.");
    } finally {
      setOccupe(false);
    }
  }

  async function desactiver() {
    setOccupe(true);
    setErreur(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.getSubscription();
      if (abonnement) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: JSON_HEADERS,
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: abonnement.endpoint }),
        });
        await abonnement.unsubscribe();
      }
      await lireEtat();
    } catch {
      setErreur("Désactivation impossible.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-pine">
        <Bell size={18} />
        <h2 className="font-serif text-xl font-semibold">Notifications</h2>
      </div>
      <p className="mb-3 text-sm text-pine/60">
        Soyez prévenue d&apos;une demande de transfert ou d&apos;une transmission urgente, même application fermée. La
        notification ne contient <strong>aucune information médicale</strong> (ni nom de patient) : le détail se lit
        dans l&apos;application, après connexion. Vous choisissez, appareil par appareil.
      </p>

      {etat.type === "chargement" && <p className="text-sm text-pine/45">Chargement…</p>}
      {etat.type === "indisponible" && <p className="text-sm text-pine/55">{etat.raison}</p>}
      {etat.type === "inactif" && (
        <button type="button" disabled={occupe} onClick={activer} className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          Activer sur cet appareil
        </button>
      )}
      {etat.type === "actif" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-statut-faite">Activées sur cet appareil.</p>
          <label className="flex items-center gap-2 text-sm text-pine">
            <input type="checkbox" checked={etat.transferts} disabled={occupe} onChange={(e) => majPreferences(e.target.checked, etat.urgences)} className="accent-[#25453a]" />
            Demandes de transfert reçues
          </label>
          <label className="flex items-center gap-2 text-sm text-pine">
            <input type="checkbox" checked={etat.urgences} disabled={occupe} onChange={(e) => majPreferences(etat.transferts, e.target.checked)} className="accent-[#25453a]" />
            Transmissions urgentes
          </label>
          <button type="button" disabled={occupe} onClick={desactiver} className="mt-1 w-fit rounded-full border border-statut-absent/40 px-4 py-2 text-sm font-semibold text-statut-absent disabled:opacity-60">
            Désactiver sur cet appareil
          </button>
        </div>
      )}
      {erreur && <p className="mt-2 text-sm text-statut-absent">{erreur}</p>}
    </section>
  );
}
