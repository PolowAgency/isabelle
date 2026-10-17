import { createHmac } from "crypto";

// Limitation des tentatives de connexion : fonctions pures (testées) ; les
// compteurs vivent en base (migrations/0009_audit_login.sql).
//
// Par adresse email : à partir de 5 échecs récents, délai croissant avant la
// tentative suivante (30 s, 1 min, 2 min, 4 min… plafonné à 15 min), levé
// automatiquement. Par adresse IP : seuil plus haut (20) car un cabinet partage
// souvent une seule adresse. Les emails inconnus sont comptés comme les autres :
// le comportement ne révèle jamais si un compte existe.

export const SEUIL_ECHECS_EMAIL = 5;
export const SEUIL_ECHECS_IP = 20;
export const DELAI_MAX_SECONDES = 15 * 60;

export function delaiSecondes(echecs: number, seuil: number): number {
  if (echecs < seuil) return 0;
  return Math.min(30 * 2 ** (echecs - seuil), DELAI_MAX_SECONDES);
}

export type EtatTentatives = {
  echecsEmail: number;
  echecsIp: number;
  dernierEchecEmail: Date | null;
  dernierEchecIp: Date | null;
};

export function blocage(
  etat: EtatTentatives,
  maintenant: Date = new Date()
): { bloque: boolean; secondes: number } {
  const restant = (echecs: number, seuil: number, dernier: Date | null) => {
    if (!dernier) return 0;
    const delai = delaiSecondes(echecs, seuil);
    return Math.max(0, Math.ceil((dernier.getTime() + delai * 1000 - maintenant.getTime()) / 1000));
  };
  const secondes = Math.max(
    restant(etat.echecsEmail, SEUIL_ECHECS_EMAIL, etat.dernierEchecEmail),
    restant(etat.echecsIp, SEUIL_ECHECS_IP, etat.dernierEchecIp)
  );
  return { bloque: secondes > 0, secondes };
}

export function messageBlocage(secondes: number): string {
  const minutes = Math.ceil(secondes / 60);
  return `Trop de tentatives. Réessayez dans ${minutes <= 1 ? "1 minute" : `${minutes} minutes`}.`;
}

/** Empreinte HMAC : ni l'email ni l'adresse IP ne sont stockés en clair dans les compteurs et l'audit. */
export function empreinte(valeur: string, secret = process.env.AUTH_SECRET ?? ""): string {
  return createHmac("sha256", secret).update(valeur.trim().toLowerCase()).digest("hex");
}

/** Première adresse de X-Forwarded-For (posée par le proxy de l'hébergeur), sinon null. */
export function ipDepuisEntetes(entetes: { get(nom: string): string | null }): string | null {
  const brut = entetes.get("x-forwarded-for") ?? entetes.get("x-real-ip");
  const ip = brut?.split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}
