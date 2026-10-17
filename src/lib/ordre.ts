// Réordonnancement des visites d'une tranche : fonctions pures partagées par le
// serveur (transaction) et le mode hors-ligne (instantané local).

export type Sens = "haut" | "bas";

/**
 * Déplace `id` d'un cran dans `ids` (déjà triés). Renvoie la nouvelle liste, ou
 * null si le déplacement est impossible (déjà en tête / en queue, id absent).
 * `figes` = ids qui ne bougent pas (visites déjà traitées) : on échange avec la voisine à faire la plus proche.
 */
export function deplacerDansListe(
  ids: readonly string[],
  id: string,
  sens: Sens,
  figes: ReadonlySet<string> = new Set()
): string[] | null {
  const i = ids.indexOf(id);
  if (i < 0 || figes.has(id)) return null;
  const pas = sens === "haut" ? -1 : 1;
  let j = i + pas;
  while (j >= 0 && j < ids.length && figes.has(ids[j])) j += pas;
  if (j < 0 || j >= ids.length) return null;
  // Échange avec la voisine à faire la plus proche : les visites figées gardent exactement leur place.
  const copie = [...ids];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}

type AvecGroupe = { id: string; tranche: string; statut: string; soignanteId?: string };

/**
 * Applique le déplacement dans une liste de visites déjà triée (écran, instantané hors-ligne) :
 * seules les visites de la même tranche (et de la même soignante si connue) sont réordonnées,
 * les autres gardent leur place dans le tableau. Renvoie la même liste si rien ne bouge.
 */
export function deplacerVisitesDansTranche<T extends AvecGroupe>(visites: readonly T[], id: string, sens: Sens): T[] {
  const cible = visites.find((v) => v.id === id);
  if (!cible) return [...visites];
  const dansGroupe = (v: T) =>
    v.tranche === cible.tranche && v.statut !== "annulee" && v.soignanteId === cible.soignanteId;
  const groupe = visites.filter(dansGroupe);
  const figes = new Set(groupe.filter((v) => v.statut !== "prevue").map((v) => v.id));
  const nouvelOrdre = deplacerDansListe(groupe.map((v) => v.id), id, sens, figes);
  if (!nouvelOrdre) return [...visites];
  const parId = new Map(groupe.map((v) => [v.id, v]));
  let k = 0;
  return visites.map((v) => (dansGroupe(v) ? parId.get(nouvelOrdre[k++])! : v));
}
