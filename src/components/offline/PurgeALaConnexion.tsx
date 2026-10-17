"use client";

import { useEffect } from "react";
import { purgerDonneesLocales } from "@/lib/offline/stockage";

/**
 * Sur la page de connexion, plus personne n'est connecté : on efface les données
 * patient du mode hors-ligne (couvre aussi l'expiration et « se déconnecter partout »).
 * Les actions non envoyées restent, pour être synchronisées à la prochaine connexion.
 */
export function PurgeALaConnexion() {
  useEffect(() => {
    void purgerDonneesLocales().catch(() => undefined);
  }, []);
  return null;
}
