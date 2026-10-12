import type { PublicSoignante } from "@/lib/schema";

export function getDisplayName(soignante: Pick<PublicSoignante, "prenom" | "nom">): string {
  return `${soignante.prenom} ${soignante.nom}`;
}

export function getInitiales(prenom: string, nom: string): string {
  return `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
}
