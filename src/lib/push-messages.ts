// Textes des notifications push. Chaîne FIGÉE par type d'événement : aucune
// donnée variable (ni nom de patient, ni contenu de transmission, ni nom de
// collègue) ne peut s'y glisser. Le détail s'affiche dans l'application, après connexion.

export type MotifNotification = "transfert" | "urgence" | "traitement";

export type ContenuNotification = {
  titre: string;
  corps: string;
  url: string;
  tag: string;
};

const MESSAGES: Record<MotifNotification, ContenuNotification> = {
  transfert: {
    titre: "Isabelle — Tournée",
    corps: "Nouvelle demande de transfert à traiter.",
    url: "/alertes",
    tag: "transfert",
  },
  urgence: {
    titre: "Isabelle — Tournée",
    corps: "Transmission urgente à lire.",
    url: "/alertes",
    tag: "urgence",
  },
  traitement: {
    titre: "Isabelle — Tournée",
    corps: "Une alerte à consulter.",
    url: "/alertes",
    tag: "traitement",
  },
};

export function construireNotification(motif: MotifNotification): ContenuNotification {
  return MESSAGES[motif];
}
