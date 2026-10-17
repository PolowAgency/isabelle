"use client";

import { LogOut } from "lucide-react";
import { purgerDonneesLocales } from "@/lib/offline/stockage";

/**
 * Déconnexion : efface d'abord les données patient conservées sur l'appareil pour le
 * mode hors-ligne (les actions non encore envoyées sont gardées, voir stockage.ts).
 */
export function SignOutButton() {
  async function deconnecter() {
    try {
      await purgerDonneesLocales();
    } catch {
      // stockage local indisponible : rien à effacer
    }
    window.location.assign("/api/session-expiree?motif=bye");
  }

  return (
    <button
      type="button"
      onClick={deconnecter}
      className="flex w-full items-center justify-center gap-2 py-3 font-medium text-coral"
    >
      <LogOut size={18} /> Déconnexion
    </button>
  );
}
