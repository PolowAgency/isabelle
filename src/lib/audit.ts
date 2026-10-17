import "server-only";

import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { withSoignante, type Db } from "@/lib/db";
import { empreinte, ipDepuisEntetes } from "@/lib/login-guard";

// Journal d'audit : QUI a fait QUOI sur QUELLE entité, QUAND. Uniquement des
// identifiants et un type d'action — jamais de contenu médical (ni valeur de champ,
// ni texte de transmission, ni nom de fichier). Lecture réservée aux admins.

export type ActionAudit =
  | "connexion"
  | "connexion_echec"
  | "connexion_bloquee"
  | "deconnexion_globale"
  | "mot_de_passe_change"
  | "mot_de_passe_reinitialise"
  | "compte_cree"
  | "compte_modifie"
  | "droits_admin_modifies"
  | "patient_consulte"
  | "patient_cree"
  | "patient_modifie"
  | "acces_domicile_consulte"
  | "acces_domicile_modifie"
  | "document_ajoute"
  | "documents_consultes"
  | "ordonnance_ajoutee"
  | "ordonnance_archivee"
  | "serie_creee"
  | "transfert_cree"
  | "transfert_accepte"
  | "transfert_refuse"
  | "export_passages"
  | "journal_consulte"
  | "donnees_hors_ligne_telechargees"
  | "operations_hors_ligne_rejouees"
  | "notifications_activees"
  | "notifications_desactivees"
  | "reglages_planning_modifies"
  | "absence_declaree"
  | "absence_supprimee"
  | "absence_repartie"
  | "prise_corrigee"
  | "alerte_prise_traitee";

export type EntiteAudit =
  | "soignante"
  | "patient"
  | "acces_domicile"
  | "document"
  | "ordonnance"
  | "serie"
  | "transfert"
  | "export"
  | "audit"
  | "hors_ligne"
  | "notifications"
  | "reglages"
  | "absence";

export type EvenementAudit = {
  action: ActionAudit;
  entite: EntiteAudit;
  entiteId?: string | null;
  patientId?: string | null;
  /** Ignore un événement identique du même utilisateur survenu dans les N dernières minutes. */
  dedoublonnerMinutes?: number;
};

/** Empreinte de l'adresse IP de la requête en cours (jamais l'adresse elle-même), si disponible. */
export function ipHachee(): string | null {
  try {
    const ip = ipDepuisEntetes(headers());
    return ip ? empreinte(ip) : null;
  } catch {
    // Hors requête HTTP (scripts, tests).
    return null;
  }
}

/** À appeler dans la transaction de l'action : l'audit et l'opération réussissent ou échouent ensemble. */
export async function auditer(tx: Db, evenement: EvenementAudit): Promise<void> {
  await tx.execute(sql`select audit_enregistrer(
    ${evenement.action}, ${evenement.entite},
    ${evenement.entiteId ?? null}::uuid, ${evenement.patientId ?? null}::uuid,
    ${ipHachee()}, ${evenement.dedoublonnerMinutes ?? 0}::int
  )`);
}

/** Pour une action qui n'a pas de transaction propre. */
export async function auditerSeul(soignanteId: string, evenement: EvenementAudit): Promise<void> {
  await withSoignante(soignanteId, (tx) => auditer(tx, evenement));
}
