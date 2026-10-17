"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { deconnecterPartoutAction } from "@/app/(app)/actions";

/** « Se déconnecter partout » : invalide toutes les sessions (téléphone perdu, poste partagé…). */
export function SessionCard() {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function deconnecter() {
    if (!window.confirm("Se déconnecter de tous les appareils, y compris celui-ci ?")) return;
    setErreur(null);
    startTransition(async () => {
      const res = await deconnecterPartoutAction();
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      window.location.assign("/api/session-expiree?motif=ailleurs");
    });
  }

  return (
    <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-pine">
        <LogOut size={18} />
        <h2 className="font-serif text-xl font-semibold">Sécurité de la session</h2>
      </div>
      <p className="mb-3 text-sm text-pine/60">
        Téléphone perdu ou prêté ? Déconnectez tous les appareils où votre compte est ouvert.
      </p>
      {erreur && <p className="mb-2 text-sm text-statut-absent">{erreur}</p>}
      <button
        type="button"
        onClick={deconnecter}
        disabled={pending}
        className="rounded-full border border-statut-absent/40 px-4 py-2 text-sm font-semibold text-statut-absent disabled:opacity-60"
      >
        Se déconnecter partout
      </button>
    </section>
  );
}
