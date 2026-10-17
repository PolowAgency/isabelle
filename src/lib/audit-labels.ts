// Libellés lisibles du journal d'activité (page admin). Aucun contenu médical.
export const LIBELLES_ACTION: Record<string, string> = {
  connexion: "Connexion",
  connexion_echec: "Échec de connexion",
  connexion_bloquee: "Connexion bloquée (trop de tentatives)",
  deconnexion_globale: "Déconnexion de tous les appareils",
  mot_de_passe_change: "Mot de passe modifié",
  mot_de_passe_reinitialise: "Mot de passe réinitialisé par un admin",
  compte_cree: "Compte créé",
  compte_modifie: "Compte modifié",
  droits_admin_modifies: "Droits d'administration modifiés",
  patient_consulte: "Fiche patient consultée",
  patient_cree: "Patient créé",
  acces_domicile_consulte: "Accès au domicile consulté",
  acces_domicile_modifie: "Accès au domicile modifié",
  document_ajoute: "Document ajouté",
  documents_consultes: "Documents / ordonnances consultés",
  ordonnance_ajoutee: "Ordonnance ajoutée",
  ordonnance_archivee: "Ordonnance archivée",
  serie_creee: "Soin récurrent créé",
  transfert_cree: "Transfert demandé",
  transfert_accepte: "Transfert accepté",
  transfert_refuse: "Transfert refusé",
  export_passages: "Export du journal des passages",
  journal_consulte: "Journal d'activité consulté",
  donnees_hors_ligne_telechargees: "Données du mode hors-ligne téléchargées",
  operations_hors_ligne_rejouees: "Actions faites hors-ligne synchronisées",
  notifications_activees: "Notifications activées sur un appareil",
  notifications_desactivees: "Notifications désactivées"
};

export function libelleAction(action: string): string {
  return LIBELLES_ACTION[action] ?? action;
}
