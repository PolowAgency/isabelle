import { passageDeTranche, type Tranche } from "@/lib/tranches";

// « Du matin » / « du soir » : déduit des tranches des visites de la
// soignante ce jour-là, sans saisie supplémentaire. Une soignante sans visite
// n'a pas de poste affiché.

export type Poste = "matin" | "midi" | "soir" | "matin_soir";

export const POSTE_LABELS: Record<Poste, string> = {
  matin: "Du matin",
  midi: "Midi",
  soir: "Du soir",
  matin_soir: "Matin & soir",
};

export function posteDuJour(tranches: Tranche[]): Poste | null {
  if (tranches.length === 0) return null;
  const passages = new Set(tranches.map(passageDeTranche));
  const matin = passages.has("matin");
  const soir = passages.has("soir");
  if (matin && soir) return "matin_soir";
  if (matin) return "matin";
  if (soir) return "soir";
  return "midi";
}
