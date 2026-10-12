import type {
  Patient,
  Soignante,
  Visite,
  Traitement,
  Ordonnance,
  PhotoSuivi,
} from "@/types/database";

export interface VisiteAvecRelations extends Visite {
  patients: Patient;
  soignantes: Soignante;
}

export interface VisiteHistorique extends Visite {
  soignantes: Pick<Soignante, "id" | "nom" | "initiales" | "couleur">;
}

export type TraitementDu = Traitement;

export interface OrdonnanceAvecUrl extends Ordonnance {
  signedUrl: string | null;
}

export interface PhotoAvecUrl extends PhotoSuivi {
  signedUrl: string | null;
}
