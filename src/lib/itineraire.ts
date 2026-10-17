// Liens d'appel et d'itinéraire à partir de la fiche patient. Aucun service
// tiers n'est appelé par l'application : on ouvre l'appli de cartographie de
// l'appareil, qui reçoit l'adresse (c'est l'infirmière qui déclenche le lien).

export type AdressePatient = {
  adresse: string | null;
  codePostal?: string | null;
  ville: string | null;
};

/** Adresse sur une ligne ; null si aucune rue n'est renseignée (une ville seule ne suffit pas à guider). */
export function adresseComplete({ adresse, codePostal, ville }: AdressePatient): string | null {
  if (!adresse?.trim()) return null;
  return [adresse.trim(), [codePostal?.trim(), ville?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function lienGoogleMaps(a: AdressePatient): string | null {
  const texte = adresseComplete(a);
  return texte ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(texte)}&travelmode=driving` : null;
}

export function lienWaze(a: AdressePatient): string | null {
  const texte = adresseComplete(a);
  return texte ? `https://waze.com/ul?q=${encodeURIComponent(texte)}&navigate=yes` : null;
}

/** Lien `tel:` ; null si le numéro ne contient pas assez de chiffres. */
export function lienAppel(telephone: string | null | undefined): string | null {
  if (!telephone) return null;
  const nettoye = telephone.replace(/[^\d+]/g, "");
  return nettoye.replace(/\D/g, "").length >= 6 ? `tel:${nettoye}` : null;
}
