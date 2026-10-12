export const PALETTE_SOIGNANTES = [
  "#25453a",
  "#e0704a",
  "#7c9c8d",
  "#b0703a",
  "#5a7d9a",
  "#9a5a7d",
  "#6b8e4e",
  "#a94442",
];

export const PALETTE_SECTEURS = [
  "#a9c4ab",
  "#c4b9a9",
  "#a9b7c4",
  "#c4a9bb",
  "#b9c4a9",
  "#d8cfba",
  "#c9954a",
  "#8aa57f",
];

export function prochaineCouleur(couleursUtilisees: string[]): string {
  return (
    PALETTE_SOIGNANTES.find((c) => !couleursUtilisees.includes(c)) ??
    PALETTE_SOIGNANTES[couleursUtilisees.length % PALETTE_SOIGNANTES.length]
  );
}

export function prochaineCouleurSecteur(couleursUtilisees: string[]): string {
  return (
    PALETTE_SECTEURS.find((c) => !couleursUtilisees.includes(c)) ??
    PALETTE_SECTEURS[couleursUtilisees.length % PALETTE_SECTEURS.length]
  );
}

export function initialesDe(nom: string): string {
  return nom
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
