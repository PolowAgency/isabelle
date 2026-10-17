import "server-only";

import { authLoginEnregistrer, authLoginEtat, authLookupSoignante, type AuthLookupRow } from "@/lib/db";
import { blocage, empreinte, messageBlocage } from "@/lib/login-guard";
import { hashPassword, verifyPassword } from "@/lib/password";

// Orchestration d'une tentative de connexion : limitation, vérification du mot
// de passe en temps constant (même coût que le compte existe ou non), journalisation.

let hashFactice: Promise<string> | null = null;

export type ResultatConnexion =
  | { ok: true; soignante: AuthLookupRow }
  | { ok: false; bloque: boolean; message: string };

const MESSAGE_ECHEC = "Email ou mot de passe incorrect.";

/** Vérifie seulement la limitation (avant d'appeler Auth.js), pour afficher un message clair. */
export async function verifierBlocage(
  email: string,
  ip: string | null
): Promise<{ bloque: boolean; message: string }> {
  const etat = await authLoginEtat(empreinte(email), ip ? empreinte(ip) : null);
  const b = blocage(etat);
  return { bloque: b.bloque, message: b.bloque ? messageBlocage(b.secondes) : "" };
}

export async function tenterConnexion(
  email: string,
  motDePasse: string,
  ip: string | null,
  aujourdhui: string
): Promise<ResultatConnexion> {
  const emailHash = empreinte(email);
  const ipHash = ip ? empreinte(ip) : null;

  const b = blocage(await authLoginEtat(emailHash, ipHash));
  if (b.bloque) {
    await authLoginEnregistrer({ emailHash, ipHash, succes: false, soignanteId: null, motif: "bloque" });
    return { ok: false, bloque: true, message: messageBlocage(b.secondes) };
  }

  const soignante = await authLookupSoignante(email);
  const actif = Boolean(soignante && soignante.actif && !(soignante.dateFin && soignante.dateFin < aujourdhui));

  // Un hash est toujours vérifié, même pour un compte inconnu ou inactif : le
  // temps de réponse ne distingue pas ces cas.
  const reference = soignante?.passwordHash ?? (await (hashFactice ??= hashPassword("compte-inexistant")));
  const valide = await verifyPassword(reference, motDePasse);

  if (!soignante || !actif || !valide) {
    await authLoginEnregistrer({ emailHash, ipHash, succes: false, soignanteId: soignante?.id ?? null });
    return { ok: false, bloque: false, message: MESSAGE_ECHEC };
  }

  await authLoginEnregistrer({ emailHash, ipHash, succes: true, soignanteId: soignante.id });
  return { ok: true, soignante };
}
