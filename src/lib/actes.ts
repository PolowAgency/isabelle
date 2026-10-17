// Actes de soin proposés dans l'interface. Les visites peuvent contenir
// d'autres libellés (saisie libre, données historiques) : ACTE_LABELS ne sert
// qu'à l'affichage, jamais à filtrer.

export const ACTES: { value: string; label: string }[] = [
  { value: "pansement", label: "Pansement" },
  { value: "injection", label: "Injection" },
  { value: "prise de sang", label: "Prise de sang" },
  { value: "toilette", label: "Toilette" },
  { value: "perfusion", label: "Perfusion" },
  { value: "surveillance", label: "Surveillance" },
  { value: "autre", label: "Autre" },
];

export const ACTE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ACTES.map((a) => [a.value, a.label])),
  autre: "Autre soin",
};

export function libelleActe(acte: string): string {
  return ACTE_LABELS[acte] ?? acte;
}

const MAX_ACTES = 20;
const MAX_LONGUEUR_ACTE = 60;

/** Normalise une liste d'actes reçue du client : chaînes non vides, sans doublon, bornées. */
export function nettoyerActes(actes: unknown): string[] {
  if (!Array.isArray(actes)) return [];
  const propres: string[] = [];
  for (const acte of actes) {
    if (typeof acte !== "string") continue;
    const texte = acte.trim().slice(0, MAX_LONGUEUR_ACTE);
    if (texte && !propres.includes(texte)) propres.push(texte);
    if (propres.length >= MAX_ACTES) break;
  }
  return propres;
}

export const MESSAGE_ACTE_REQUIS = "Renseignez au moins un acte avant de valider la visite.";
