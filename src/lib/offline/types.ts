// Types partagés (client / serveur) du mode hors-ligne. Aucune dépendance serveur.

import type { ReglagesPlanning } from "@/lib/planning-calc";
import type { PriseSaisie, TraitementDu } from "@/lib/prises-calc";

export type StatutVisiteHL = "prevue" | "faite" | "absent" | "reportee" | "annulee";

/** Changement de statut (validation, absence, report) : comparé à l'état connu pour détecter un conflit. */
export type OperationStatut =
  | {
      id: string; // uuid généré sur l'appareil : sert à reconnaître une opération déjà envoyée
      type: "marquer";
      visiteId: string;
      statut: "faite" | "absent";
      actes?: string[];
      /** Prises de traitement saisies à la validation (une par traitement prévu à ce passage). */
      prises?: PriseSaisie[];
      /** Statut que l'appareil connaissait quand l'action a été faite (base de la détection de conflit). */
      statutConnu: StatutVisiteHL;
      creeLe: number; // Date.now()
    }
  | {
      id: string;
      type: "decaler";
      visiteId: string;
      statutConnu: StatutVisiteHL;
      creeLe: number;
    };

/** Actions « rapides » : sans conflit de statut (voir regles.ts). */
export type OperationRapide =
  | { id: string; type: "arrivee"; visiteId: string; creeLe: number }
  | { id: string; type: "deplacer"; visiteId: string; sens: "haut" | "bas"; creeLe: number };

/** Action faite hors-ligne, rejouée au retour du réseau. */
export type OperationHorsLigne = OperationStatut | OperationRapide;

export function estOperationStatut(op: OperationHorsLigne): op is OperationStatut {
  return op.type === "marquer" || op.type === "decaler";
}

export type EtatOperation = "applique" | "deja_fait" | "conflit" | "erreur";

export type ResultatOperation = {
  id: string;
  etat: EtatOperation;
  message?: string;
  /** Statut actuel sur le serveur (à afficher à la place de l'état local en cas de conflit). */
  statutServeur?: StatutVisiteHL;
  /** Qui a traité le passage entre-temps, et quand (conflit). */
  parPrenom?: string | null;
  quand?: string | null;
};

export type ResultatSynchronisation = { resultats: ResultatOperation[] };

// --- Instantané téléchargé pour le hors-ligne ----------------------------------

export type VisiteHL = {
  id: string;
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  adresse: string | null;
  ville: string | null;
  secteurNom: string;
  tranche: string;
  actes: string[];
  /** Durée prévue (minutes), pour l'aperçu de la journée hors-ligne. */
  dureeEstimeeMin: number | null;
  statut: StatutVisiteHL;
  heureReelle: string | null;
  /** Heure d'arrivée chez le patient (« Je suis arrivée »). */
  heureArrivee: string | null;
  /** Traitements actifs prévus à ce passage, et prises déjà renseignées. */
  traitementsDus: TraitementDu[];
  prises: PriseSaisie[];
  serieId: string | null;
};

export type FicheHL = {
  patientId: string;
  prenom: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  complementAdresse: string | null;
  codePostal: string | null;
  ville: string | null;
  medecinTraitantNom: string | null;
  medecinTraitantTelephone: string | null;
  contactUrgenceNom: string | null;
  contactUrgenceTelephone: string | null;
  contactUrgenceLien: string | null;
  acces: {
    codePortail: string | null;
    codeImmeuble: string | null;
    etage: string | null;
    digicodePorte: string | null;
    emplacementCle: string | null;
    presenceAnimal: boolean;
    descriptionAnimal: string | null;
    detailsAidant: string | null;
    stationnement: string | null;
    notesAcces: string | null;
  };
  traitements: { libelle: string; dosage: string | null; passages: string[] }[];
  /** Les 5 dernières seulement (minimisation des données conservées sur l'appareil). */
  transmissions: { contenu: string; importance: string; createdAt: string; auteur: string }[];
  prochaines: { date: string; tranche: string; actes: string[] }[];
};

export type InstantaneHL = {
  soignanteId: string;
  /** Jour de la tournée (AAAA-MM-JJ, Paris) : l'instantané n'est valable que ce jour-là. */
  jour: string;
  genereLe: number;
  /** Durées par acte et capacité d'une tranche (absent des instantanés anciens : valeurs par défaut). */
  planning?: ReglagesPlanning;
  visites: VisiteHL[];
  fiches: Record<string, FicheHL>;
};

/** Au-delà, l'instantané est considéré périmé et purgé. */
export const DUREE_VIE_INSTANTANE_MS = 24 * 60 * 60 * 1000;
