import type { PublicSoignante } from "@/lib/schema";
import { passageDeTranche, type Passage, type Tranche } from "@/lib/tranches";

type DemoSecteur = {
  id: string;
  nom: string;
  ordre: number;
  couleur: string;
};

type DemoPatient = {
  id: string;
  prenom: string;
  nom: string;
  dateNaissance: string;
  telephone: string;
  adresse: string;
  complementAdresse: string | null;
  codePostal: string;
  ville: string;
  secteurId: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  contactUrgenceLien: string;
  medecinTraitantNom: string;
  medecinTraitantTelephone: string;
  acces: {
    codePortail: string | null;
    codeImmeuble: string | null;
    etage: string | null;
    digicodePorte: string | null;
    emplacementCle: string | null;
    presenceAnimal: boolean;
    descriptionAnimal: string | null;
    presenceAidant: boolean;
    detailsAidant: string | null;
    stationnement: string | null;
    notesAcces: string | null;
  };
};

type DemoVisit = {
  id: string;
  patientId: string;
  soignanteId: string;
  date: string;
  tranche: Tranche;
  ordreDansPassage: number;
  actes: string[];
  dureeEstimeeMin: number;
  statut: "prevue" | "faite" | "absent" | "reportee" | "annulee";
  heureReelle: string | null;
  serieId?: string | null;
};

type DemoTransmission = {
  id: string;
  patientId: string;
  soignanteId: string;
  contenu: string;
  importance: "info" | "attention" | "urgent";
  luePar: string[];
  createdAt: string;
};

type DemoOrdonnance = {
  id: string;
  patientId: string;
  prescripteur: string;
  datePrescription: string;
  dateDebut: string;
  dateFin: string;
  description: string;
  active: boolean;
};

type DemoDocument = {
  id: string;
  patientId: string;
  soignanteId: string;
  type: "photo" | "document";
  fichierKey: string;
  legende: string;
  createdAt: string;
};

type DemoTraitement = {
  id: string;
  patientId: string;
  libelle: string;
  dosage: string;
  passages: string[];
  notes: string | null;
};

// Le mode démo (comptes bidon, contournement du mot de passe) ne doit
// jamais s'activer en production : une variable DEMO_MODE=true oubliée sur
// l'environnement de prod ne doit pas permettre de se connecter comme
// n'importe quelle soignante (dont l'admin) avec un mot de passe arbitraire.
export function isDemoModeEnabled() {
  return process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}

export function isOfflineDbError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : String(error);
  return /(ENOTFOUND|ECONNREFUSED|getaddrinfo|connect ECONNREFUSED|network)/i.test(message);
}

/**
 * Exécute une écriture/lecture base ; en mode démo hors-ligne, retombe sur
 * une valeur de démonstration (les données démo ne sont pas modifiées).
 */
export async function orDemo<T>(run: () => Promise<T>, demo: () => T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) return demo();
    throw error;
  }
}

export const demoSoignantes: PublicSoignante[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    prenom: "Isabelle",
    nom: "Gaillard",
    email: "isabelle@cabinet-test.local",
    couleur: "#25453a",
    role: "titulaire",
    actif: true,
    remplaceId: null,
    estAdmin: true,
    sessionVersion: 0,
    mustChangePassword: false,
    dateDebut: "2026-01-01",
    dateFin: null,
    createdAt: new Date("2026-01-01T08:00:00Z"),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    prenom: "Magalie",
    nom: "Riviere",
    email: "magalie@cabinet-test.local",
    couleur: "#d36b52",
    role: "titulaire",
    actif: true,
    remplaceId: null,
    estAdmin: false,
    sessionVersion: 0,
    mustChangePassword: false,
    dateDebut: "2026-01-01",
    dateFin: null,
    createdAt: new Date("2026-01-01T08:00:00Z"),
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    prenom: "Severine",
    nom: "Bonnet",
    email: "severine@cabinet-test.local",
    couleur: "#8aa57f",
    role: "remplacante",
    actif: true,
    remplaceId: "11111111-1111-1111-1111-111111111111",
    estAdmin: false,
    sessionVersion: 0,
    mustChangePassword: false,
    dateDebut: "2026-08-01",
    dateFin: "2026-08-31",
    createdAt: new Date("2026-08-01T08:00:00Z"),
  },
];

const demoSecteurs: DemoSecteur[] = [
  { id: "s1", nom: "Centre", ordre: 1, couleur: "#d8cfba" },
  { id: "s2", nom: "Mairie", ordre: 2, couleur: "#b9d6c3" },
  { id: "s3", nom: "Rive sud", ordre: 3, couleur: "#f1d3c5" },
];

const demoPatients: DemoPatient[] = [
  {
    id: "p1",
    prenom: "Veronique",
    nom: "Riviere",
    dateNaissance: "1949-03-12",
    telephone: "06 11 22 33 44",
    adresse: "12 rue des Tilleuls",
    complementAdresse: null,
    codePostal: "64000",
    ville: "Pau",
    secteurId: "s1",
    contactUrgenceNom: "Claire Riviere",
    contactUrgenceTelephone: "06 98 76 54 32",
    contactUrgenceLien: "Fille",
    medecinTraitantNom: "Dr Martin",
    medecinTraitantTelephone: "05 59 10 20 30",
    acces: {
      codePortail: "B12A",
      codeImmeuble: null,
      etage: "RDC",
      digicodePorte: null,
      emplacementCle: "Boite a clef cote jardin",
      presenceAnimal: false,
      descriptionAnimal: null,
      presenceAidant: true,
      detailsAidant: "Passage de la fille le soir",
      stationnement: "Cour interieure a gauche",
      notesAcces: "Sonnez longuement, entend mal.",
    },
  },
  {
    id: "p2",
    prenom: "Nicole",
    nom: "Marie",
    dateNaissance: "1937-11-02",
    telephone: "06 22 11 88 77",
    adresse: "4 avenue du Stade",
    complementAdresse: "Batiment C",
    codePostal: "64000",
    ville: "Pau",
    secteurId: "s1",
    contactUrgenceNom: "Paul Marie",
    contactUrgenceTelephone: "06 45 45 45 45",
    contactUrgenceLien: "Fils",
    medecinTraitantNom: "Dr Gomis",
    medecinTraitantTelephone: "05 59 22 33 44",
    acces: {
      codePortail: null,
      codeImmeuble: "7625",
      etage: "2e droite",
      digicodePorte: "4598",
      emplacementCle: null,
      presenceAnimal: true,
      descriptionAnimal: "Petit chien calme",
      presenceAidant: false,
      detailsAidant: null,
      stationnement: "Places bleues devant l'entree",
      notesAcces: "Verifier l'hydratation.",
    },
  },
  {
    id: "p3",
    prenom: "Madeleine",
    nom: "Gaillard",
    dateNaissance: "1942-06-18",
    telephone: "06 33 33 12 12",
    adresse: "8 impasse de la Poste",
    complementAdresse: null,
    codePostal: "64140",
    ville: "Lons",
    secteurId: "s2",
    contactUrgenceNom: "Luc Gaillard",
    contactUrgenceTelephone: "06 71 12 12 12",
    contactUrgenceLien: "Neveu",
    medecinTraitantNom: "Dr Perez",
    medecinTraitantTelephone: "05 59 88 77 66",
    acces: {
      codePortail: null,
      codeImmeuble: null,
      etage: null,
      digicodePorte: null,
      emplacementCle: "Sous le pot bleu",
      presenceAnimal: false,
      descriptionAnimal: null,
      presenceAidant: true,
      detailsAidant: "Aide menagere mardi et vendredi",
      stationnement: "Facile devant le portail",
      notesAcces: "Materiel pansement dans la cuisine.",
    },
  },
  {
    id: "p4",
    prenom: "Daniel",
    nom: "Giraud",
    dateNaissance: "1951-01-27",
    telephone: "06 44 55 66 77",
    adresse: "19 chemin du Lac",
    complementAdresse: null,
    codePostal: "64320",
    ville: "Bizanos",
    secteurId: "s3",
    contactUrgenceNom: "Emma Giraud",
    contactUrgenceTelephone: "06 55 90 90 90",
    contactUrgenceLien: "Epouse",
    medecinTraitantNom: "Dr Noirot",
    medecinTraitantTelephone: "05 59 66 77 88",
    acces: {
      codePortail: "1470",
      codeImmeuble: null,
      etage: null,
      digicodePorte: null,
      emplacementCle: null,
      presenceAnimal: false,
      descriptionAnimal: null,
      presenceAidant: false,
      detailsAidant: null,
      stationnement: "Allee a droite de la maison",
      notesAcces: "Patient anxieux, rassurer avant le soin.",
    },
  },
];

const demoVisites: DemoVisit[] = [
  { id: "v1", patientId: "p1", soignanteId: demoSoignantes[0].id, date: "2026-08-15", tranche: "8-10", ordreDansPassage: 1, actes: ["Pansement", "Constantes"], dureeEstimeeMin: 25, statut: "faite", heureReelle: "2026-08-15T12:14:00Z" },
  { id: "v2", patientId: "p2", soignanteId: demoSoignantes[0].id, date: "2026-08-15", tranche: "8-10", ordreDansPassage: 2, actes: ["Injection"], dureeEstimeeMin: 15, statut: "absent", heureReelle: null },
  { id: "v3", patientId: "p3", soignanteId: demoSoignantes[1].id, date: "2026-08-15", tranche: "12-14", ordreDansPassage: 1, actes: ["Distribution traitement"], dureeEstimeeMin: 10, statut: "prevue", heureReelle: null },
  { id: "v4", patientId: "p4", soignanteId: demoSoignantes[2].id, date: "2026-08-15", tranche: "18-20", ordreDansPassage: 1, actes: ["Surveillance glycémie"], dureeEstimeeMin: 15, statut: "reportee", heureReelle: null },
  { id: "v5", patientId: "p3", soignanteId: demoSoignantes[0].id, date: "2026-08-14", tranche: "8-10", ordreDansPassage: 1, actes: ["Pansement"], dureeEstimeeMin: 20, statut: "faite", heureReelle: "2026-08-14T08:20:00Z" },
  { id: "v6", patientId: "p4", soignanteId: demoSoignantes[1].id, date: "2026-08-14", tranche: "18-20", ordreDansPassage: 1, actes: ["Injection"], dureeEstimeeMin: 15, statut: "faite", heureReelle: "2026-08-14T18:10:00Z" },
  { id: "v7", patientId: "p1", soignanteId: demoSoignantes[1].id, date: "2026-08-13", tranche: "8-10", ordreDansPassage: 1, actes: ["Constantes"], dureeEstimeeMin: 15, statut: "faite", heureReelle: "2026-08-13T07:55:00Z" },
  { id: "v8", patientId: "p2", soignanteId: demoSoignantes[2].id, date: "2026-08-13", tranche: "18-20", ordreDansPassage: 1, actes: ["Pansement"], dureeEstimeeMin: 20, statut: "prevue", heureReelle: null },
  { id: "v9", patientId: "p1", soignanteId: demoSoignantes[2].id, date: "2026-08-11", tranche: "12-14", ordreDansPassage: 1, actes: ["Hydratation"], dureeEstimeeMin: 10, statut: "faite", heureReelle: "2026-08-11T11:40:00Z" },
  { id: "v11", patientId: "p3", soignanteId: demoSoignantes[0].id, date: "2026-08-15", tranche: "18-20", ordreDansPassage: 2, actes: ["Prise de sang"], dureeEstimeeMin: 15, statut: "prevue", heureReelle: null, serieId: "serie-demo-1" },
  { id: "v12", patientId: "p3", soignanteId: demoSoignantes[0].id, date: "2026-08-16", tranche: "18-20", ordreDansPassage: 1, actes: ["Prise de sang"], dureeEstimeeMin: 15, statut: "prevue", heureReelle: null, serieId: "serie-demo-1" },
  { id: "v13", patientId: "p1", soignanteId: demoSoignantes[1].id, date: "2026-08-15", tranche: "18-20", ordreDansPassage: 2, actes: ["Injection"], dureeEstimeeMin: 15, statut: "prevue", heureReelle: null },
  { id: "v10", patientId: "p4", soignanteId: demoSoignantes[0].id, date: "2026-08-10", tranche: "8-10", ordreDansPassage: 1, actes: ["Surveillance"], dureeEstimeeMin: 15, statut: "faite", heureReelle: "2026-08-10T08:05:00Z" },
];

// « Aujourd'hui » du mode démo (les dates des données fictives sont figées).
const DEMO_AUJOURDHUI = "2026-08-15";

const demoSeries: {
  id: string;
  patientId: string;
  soignanteId: string;
  dateDebut: string;
  dateFin: string;
  frequence: "quotidien" | "un_jour_sur_deux" | "une_semaine_sur_deux" | "jours_semaine";
  tranches: Tranche[];
  actes: string[];
}[] = [
  {
    id: "serie-demo-1",
    patientId: "p3",
    soignanteId: demoSoignantes[0].id,
    dateDebut: "2026-08-15",
    dateFin: "2026-08-16",
    frequence: "quotidien",
    tranches: ["18-20"],
    actes: ["Prise de sang"],
  },
];

const demoTransmissions: DemoTransmission[] = [
  { id: "t1", patientId: "p1", soignanteId: demoSoignantes[0].id, contenu: "Pansement propre, douleur stable, recontrole demain matin.", importance: "info", luePar: [demoSoignantes[0].id], createdAt: "2026-08-15T12:18:00Z" },
  { id: "t2", patientId: "p2", soignanteId: demoSoignantes[1].id, contenu: "Absence au domicile ce matin, fille prevenue.", importance: "urgent", luePar: [], createdAt: "2026-08-15T08:35:00Z" },
  { id: "t3", patientId: "p3", soignanteId: demoSoignantes[2].id, contenu: "Traitement de midi a confirmer avec Severine.", importance: "attention", luePar: [demoSoignantes[2].id], createdAt: "2026-08-14T14:10:00Z" },
];

const demoOrdonnances: DemoOrdonnance[] = [
  { id: "o1", patientId: "p1", prescripteur: "Dr Martin", datePrescription: "2026-07-10", dateDebut: "2026-07-10", dateFin: "2026-08-25", description: "Pansement ulcere jambe gauche", active: true },
  { id: "o2", patientId: "p2", prescripteur: "Dr Gomis", datePrescription: "2026-06-01", dateDebut: "2026-06-01", dateFin: "2026-08-18", description: "Injection anticoagulant", active: true },
];

const demoDocuments: DemoDocument[] = [
  { id: "d1", patientId: "p1", soignanteId: demoSoignantes[0].id, type: "photo", fichierKey: "demo/veronique-plaie.jpg", legende: "Suivi plaie du 15 aout", createdAt: "2026-08-15T12:20:00Z" },
  { id: "d2", patientId: "p2", soignanteId: demoSoignantes[1].id, type: "document", fichierKey: "demo/nicole-ordonnance.pdf", legende: "Ordonnance en cours", createdAt: "2026-08-10T09:10:00Z" },
];

const demoTraitements: DemoTraitement[] = [
  { id: "tr1", patientId: "p1", libelle: "Paracetamol", dosage: "1 g si douleur", passages: ["matin", "soir"], notes: "Max 3 g/jour" },
  { id: "tr2", patientId: "p2", libelle: "Lovenox", dosage: "0,4 ml", passages: ["matin"], notes: "Verifier stock avant lundi" },
  { id: "tr3", patientId: "p3", libelle: "Hydratation orale", dosage: "1 verre", passages: ["midi"], notes: null },
];

function getSecteur(secteurId: string) {
  return demoSecteurs.find((secteur) => secteur.id === secteurId) ?? demoSecteurs[0];
}

function getSoignante(soignanteId: string) {
  return demoSoignantes.find((soignante) => soignante.id === soignanteId) ?? demoSoignantes[0];
}

function getPatient(patientId: string) {
  return demoPatients.find((patient) => patient.id === patientId) ?? demoPatients[0];
}

function calculateAge(dateNaissance: string) {
  const birth = new Date(`${dateNaissance}T00:00:00`);
  const today = new Date("2026-08-15T00:00:00Z");
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function ordonnanceStatut(dateFin: string) {
  const target = new Date(`${dateFin}T00:00:00Z`).getTime();
  const today = new Date("2026-08-15T00:00:00Z").getTime();
  const diff = Math.round((target - today) / 86_400_000);
  if (diff < 0) return "expired";
  if (diff <= 30) return "soon";
  return "ok";
}

export function getDemoTransferts(soignanteId: string) {
  const patient = getPatient("p3");
  const base = {
    cible: "patient" as const,
    patientId: patient.id,
    patientPrenom: patient.prenom,
    patientNom: patient.nom,
    visiteDate: null,
    visiteTranche: null,
    serieDebut: null,
    serieFin: null,
    message: "Je pars en congés la semaine prochaine, peux-tu la reprendre ?",
  };
  const [isabelle, magalie] = demoSoignantes;
  const ligne = (de: PublicSoignante, vers: PublicSoignante) => ({
    deId: de.id,
    dePrenom: de.prenom,
    deNom: de.nom,
    versId: vers.id,
    versPrenom: vers.prenom,
    versNom: vers.nom,
  });
  const recu = {
    id: "tf1",
    statut: "en_attente" as const,
    createdAt: "2026-08-15T07:30:00.000Z",
    traiteAt: null,
    ...base,
    ...ligne(magalie, isabelle),
  };
  const reponse = {
    id: "tf2",
    statut: "accepte" as const,
    createdAt: "2026-08-14T17:00:00.000Z",
    traiteAt: "2026-08-14T18:10:00.000Z",
    ...base,
    message: null,
    ...ligne(isabelle, magalie),
  };
  return soignanteId === isabelle.id
    ? { recus: [recu], reponses: [reponse], envoyes: [] }
    : { recus: [], reponses: [], envoyes: [] };
}

export function getDemoAlertesCount(soignanteId: string) {
  const alertes = getDemoAlerts();
  const transferts = getDemoTransferts(soignanteId);
  return (
    alertes.ordonnances.length +
    alertes.transmissions.length +
    alertes.visites.length +
    transferts.recus.length +
    transferts.reponses.length
  );
}

export function getDemoVisiteActes(visiteId: string): string[] {
  return demoVisites.find((v) => v.id === visiteId)?.actes ?? [];
}

export function getDemoCurrentSoignante() {
  return demoSoignantes[0];
}

export function getDemoEquipe() {
  return demoSoignantes;
}

export function getDemoSecteurs() {
  return demoSecteurs;
}

export function getDemoTitulairesActives() {
  return demoSoignantes.filter((soignante) => soignante.role === "titulaire" && soignante.actif);
}

export function getDemoMonthlyFigures() {
  return {
    visitesPlanifiees: demoVisites.length,
    visitesFaites: demoVisites.filter((visite) => visite.statut === "faite").length,
    visitesAbsentes: demoVisites.filter((visite) => visite.statut === "absent").length,
    visitesReportees: demoVisites.filter((visite) => visite.statut === "reportee").length,
    patientsActifs: demoPatients.length,
    remplacantesActives: demoSoignantes.filter((soignante) => soignante.role === "remplacante" && soignante.actif).length,
  };
}

export function getDemoTeamWorkload() {
  return demoSoignantes.map((soignante) => {
    const visites = demoVisites.filter((visite) => visite.soignanteId === soignante.id);
    return {
      soignanteId: soignante.id,
      prenom: soignante.prenom,
      nom: soignante.nom,
      couleur: soignante.couleur,
      role: soignante.role,
      planifiées: visites.length,
      faites: visites.filter((visite) => visite.statut === "faite").length,
      absentes: visites.filter((visite) => visite.statut === "absent").length,
      reportees: visites.filter((visite) => visite.statut === "reportee").length,
    };
  });
}

export function getDemoRemplacanteById(remplacanteId: string) {
  return demoSoignantes.find((soignante) => soignante.id === remplacanteId && soignante.role === "remplacante") ?? null;
}

function trancheRang(tranche: Tranche) {
  return Number.parseInt(tranche, 10);
}

export function getDemoTourneeVisites(soignanteId: string, date: string, passage: Passage | "jour", vue: "mine" | "equipe") {
  return demoVisites
    .filter(
      (visite) =>
        visite.date === date &&
        (passage === "jour" || passageDeTranche(visite.tranche) === passage) &&
        visite.statut !== "annulee"
    )
    .filter((visite) => (vue === "mine" ? visite.soignanteId === soignanteId : true))
    .sort(
      (a, b) =>
        trancheRang(a.tranche) - trancheRang(b.tranche) || a.ordreDansPassage - b.ordreDansPassage
    )
    .map((visite) => {
      const patient = getPatient(visite.patientId);
      const soignante = getSoignante(visite.soignanteId);
      const secteur = getSecteur(patient.secteurId);
      const hasTransmission = demoTransmissions.some(
        (transmission) =>
          transmission.patientId === patient.id && !transmission.luePar.includes(soignanteId)
      );
      const ordonnanceAlert = demoOrdonnances.some(
        (ordonnance) => ordonnance.patientId === patient.id && ordonnance.active
      );

      return {
        id: visite.id,
        patientId: patient.id,
        patientPrenom: patient.prenom,
        patientNom: patient.nom,
        adresse: patient.adresse,
        ville: patient.ville,
        secteurId: secteur.id,
        secteurNom: secteur.nom,
        secteurOrdre: secteur.ordre,
        tranche: visite.tranche,
        ordreDansPassage: visite.ordreDansPassage,
        actes: visite.actes,
        dureeEstimeeMin: visite.dureeEstimeeMin,
        statut: visite.statut,
        heureReelle: visite.heureReelle ? new Date(visite.heureReelle) : null,
        serieId: visite.serieId ?? null,
        soignanteId: soignante.id,
        soignantePrenom: soignante.prenom,
        soignanteCouleur: soignante.couleur,
        transmissionNonLue: hasTransmission,
        ordonnanceAlerte: ordonnanceAlert,
      };
    });
}

export function getDemoWeekVisits(mondayIso: string, sundayIso: string) {
  return demoVisites
    .filter(
      (visite) =>
        visite.date >= mondayIso && visite.date <= sundayIso && visite.statut !== "annulee"
    )
    .map((visite) => {
      const patient = getPatient(visite.patientId);
      const soignante = getSoignante(visite.soignanteId);
      const secteur = getSecteur(patient.secteurId);
      return {
        id: visite.id,
        date: visite.date,
        passage: passageDeTranche(visite.tranche),
        tranche: visite.tranche,
        statut: visite.statut,
        patientId: patient.id,
        patientPrenom: patient.prenom,
        patientNom: patient.nom,
        secteurNom: secteur.nom,
        secteurOrdre: secteur.ordre,
        soignanteId: soignante.id,
        soignantePrenom: soignante.prenom,
        soignanteNom: soignante.nom,
        soignanteCouleur: soignante.couleur,
      };
    })
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.secteurOrdre - b.secteurOrdre
    );
}

export function getDemoPatientsList(soignanteId: string) {
  return {
    patients: demoPatients.map((patient) => {
      const secteur = getSecteur(patient.secteurId);
      return {
        id: patient.id,
        prenom: patient.prenom,
        nom: patient.nom,
        adresse: patient.adresse,
        complementAdresse: patient.complementAdresse,
        codePostal: patient.codePostal,
        ville: patient.ville,
        secteurId: secteur.id,
        secteurNom: secteur.nom,
        secteurCouleur: secteur.couleur,
        secteurOrdre: secteur.ordre,
        transmissionNonLue: demoTransmissions.some(
          (transmission) =>
            transmission.patientId === patient.id && !transmission.luePar.includes(soignanteId)
        ),
        ordonnanceAlerte: demoOrdonnances.some(
          (ordonnance) => ordonnance.patientId === patient.id && ordonnance.active
        ),
      };
    }),
    secteurs: demoSecteurs.map((secteur) => ({
      ...secteur,
      count: demoPatients.filter((patient) => patient.secteurId === secteur.id).length,
    })),
  };
}

export function getDemoPatientDetail(soignanteId: string, patientId: string) {
  const patient = demoPatients.find((item) => item.id === patientId);
  if (!patient) return null;
  const secteur = getSecteur(patient.secteurId);

  return {
    patient: {
      id: patient.id,
      prenom: patient.prenom,
      nom: patient.nom,
      age: calculateAge(patient.dateNaissance),
      telephone: patient.telephone,
      adresse: patient.adresse,
      complementAdresse: patient.complementAdresse,
      codePostal: patient.codePostal,
      ville: patient.ville,
      secteurNom: secteur.nom,
      secteurCouleur: secteur.couleur,
      contactUrgenceNom: patient.contactUrgenceNom,
      contactUrgenceTelephone: patient.contactUrgenceTelephone,
      contactUrgenceLien: patient.contactUrgenceLien,
      medecinTraitantNom: patient.medecinTraitantNom,
      medecinTraitantTelephone: patient.medecinTraitantTelephone,
    },
    access: {
      patientId: patient.id,
      ...patient.acces,
      updatedAt: "2026-08-15T08:00:00.000Z",
    },
    transmissions: demoTransmissions
      .filter((transmission) => transmission.patientId === patient.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((transmission) => {
        const soignante = getSoignante(transmission.soignanteId);
        return {
          id: transmission.id,
          contenu: transmission.contenu,
          importance: transmission.importance,
          luePar: transmission.luePar,
          isRead: transmission.luePar.includes(soignanteId),
          createdAt: transmission.createdAt,
          soignante: {
            id: soignante.id,
            prenom: soignante.prenom,
            nom: soignante.nom,
            couleur: soignante.couleur,
          },
        };
      }),
    treatments: demoTraitements.filter((traitement) => traitement.patientId === patient.id),
    ordonnances: demoOrdonnances
      .filter((ordonnance) => ordonnance.patientId === patient.id)
      .map((ordonnance) => ({
        ...ordonnance,
        signedUrl: null,
        statut: ordonnanceStatut(ordonnance.dateFin),
      })),
    visits: demoVisites
      .filter((visite) => visite.patientId === patient.id)
      .filter((visite) => visite.date < DEMO_AUJOURDHUI || visite.statut !== "prevue")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((visite) => {
        const soignante = getSoignante(visite.soignanteId);
        return {
          id: visite.id,
          date: visite.date,
          passage: passageDeTranche(visite.tranche),
          tranche: visite.tranche,
          actes: visite.actes,
          statut: visite.statut,
          soignante: {
            id: soignante.id,
            prenom: soignante.prenom,
            nom: soignante.nom,
            couleur: soignante.couleur,
          },
        };
      }),
    prochaines: demoVisites
      .filter(
        (visite) =>
          visite.patientId === patient.id &&
          visite.statut === "prevue" &&
          visite.date >= DEMO_AUJOURDHUI
      )
      .sort((a, b) => a.date.localeCompare(b.date) || trancheRang(a.tranche) - trancheRang(b.tranche))
      .map((visite) => {
        const soignante = getSoignante(visite.soignanteId);
        return {
          id: visite.id,
          date: visite.date,
          tranche: visite.tranche,
          actes: visite.actes,
          serieId: visite.serieId ?? null,
          soignante: {
            id: soignante.id,
            prenom: soignante.prenom,
            nom: soignante.nom,
            couleur: soignante.couleur,
          },
        };
      }),
    series: demoSeries
      .filter((serie) => serie.patientId === patient.id)
      .map((serie) => {
        const soignante = getSoignante(serie.soignanteId);
        const restantes = demoVisites.filter(
          (visite) =>
            visite.serieId === serie.id &&
            visite.statut === "prevue" &&
            visite.date >= DEMO_AUJOURDHUI
        );
        return {
          id: serie.id,
          dateDebut: serie.dateDebut,
          dateFin: serie.dateFin,
          frequence: serie.frequence,
          joursSemaine: [] as number[],
          tranches: serie.tranches,
          actes: serie.actes,
          restantes: restantes.length,
          prochaineDate: restantes.map((v) => v.date).sort()[0] ?? null,
          soignante: {
            id: soignante.id,
            prenom: soignante.prenom,
            nom: soignante.nom,
            couleur: soignante.couleur,
          },
        };
      })
      .filter((serie) => serie.restantes > 0),
    documents: demoDocuments
      .filter((document) => document.patientId === patient.id)
      .map((document) => ({
        id: document.id,
        type: document.type,
        legende: document.legende,
        createdAt: document.createdAt,
        signedUrl: null,
        filename: document.fichierKey.split("/").pop() ?? document.fichierKey,
        isImage: document.type === "photo",
      })),
    storageConfigured: false,
  };
}

export function getDemoAlerts() {
  return {
    ordonnances: demoOrdonnances
      .filter((ordonnance) => ordonnance.active)
      .map((ordonnance) => {
        const patient = getPatient(ordonnance.patientId);
        return {
          id: ordonnance.id,
          patientId: patient.id,
          patientNom: patient.nom,
          patientPrenom: patient.prenom,
          dateFin: ordonnance.dateFin,
          prescripteur: ordonnance.prescripteur,
        };
      }),
    transmissions: demoTransmissions
      .filter((transmission) => transmission.importance === "urgent")
      .map((transmission) => {
        const patient = getPatient(transmission.patientId);
        const soignante = getSoignante(transmission.soignanteId);
        return {
          id: transmission.id,
          patientId: patient.id,
          patientNom: patient.nom,
          patientPrenom: patient.prenom,
          contenu: transmission.contenu,
          createdAt: transmission.createdAt,
          soignantePrenom: soignante.prenom,
          soignanteNom: soignante.nom,
        };
      }),
    visites: demoVisites
      .filter((visite) => visite.statut === "prevue" && visite.date === "2026-08-14")
      .map((visite) => {
        const patient = getPatient(visite.patientId);
        const soignante = getSoignante(visite.soignanteId);
        return {
          id: visite.id,
          patientId: patient.id,
          patientNom: patient.nom,
          patientPrenom: patient.prenom,
          date: visite.date,
          passage: passageDeTranche(visite.tranche),
          soignantePrenom: soignante.prenom,
          soignanteNom: soignante.nom,
        };
      }),
  };
}

export function getDemoJournalPassages(du: string, au: string, soignanteId: string | null) {
  return demoVisites
    .filter(
      (visite) =>
        visite.date >= du &&
        visite.date <= au &&
        (soignanteId === null || visite.soignanteId === soignanteId)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || trancheRang(a.tranche) - trancheRang(b.tranche))
    .map((visite) => {
      const patient = getPatient(visite.patientId);
      const soignante = getSoignante(visite.soignanteId);
      return {
        date: visite.date,
        tranche: visite.tranche,
        patientNom: patient.nom,
        patientPrenom: patient.prenom,
        soignantePrenom: soignante.prenom,
        soignanteNom: soignante.nom,
        actes: visite.actes,
        statut: visite.statut,
        heureReelle: visite.heureReelle ? new Date(visite.heureReelle) : null,
      };
    });
}

export function getDemoAudit() {
  return {
    tronque: false,
    lignes: [
      {
        id: "a1",
        createdAt: "2026-08-15T07:55:00.000Z",
        action: "patient_consulte",
        entite: "patient",
        soignante: "Magalie Riviere",
        patient: "Madeleine Gaillard",
      },
      {
        id: "a2",
        createdAt: "2026-08-15T07:50:00.000Z",
        action: "connexion",
        entite: "soignante",
        soignante: "Magalie Riviere",
        patient: null,
      },
    ],
  };
}

/** Instantané hors-ligne de démonstration (dates fictives figées au jour démo). */
export function getDemoInstantane(soignanteId: string) {
  const fiches: Record<string, import("@/lib/offline/types").FicheHL> = {};
  for (const visite of getDemoTourneeVisites(soignanteId, DEMO_AUJOURDHUI, "jour", "mine")) {
    const detail = getDemoPatientDetail(soignanteId, visite.patientId);
    if (!detail || fiches[visite.patientId]) continue;
    const p = detail.patient;
    const a = detail.access;
    fiches[p.id] = {
      patientId: p.id,
      prenom: p.prenom,
      nom: p.nom,
      telephone: p.telephone,
      adresse: p.adresse,
      complementAdresse: p.complementAdresse,
      codePostal: p.codePostal,
      ville: p.ville,
      medecinTraitantNom: p.medecinTraitantNom,
      medecinTraitantTelephone: p.medecinTraitantTelephone,
      contactUrgenceNom: p.contactUrgenceNom,
      contactUrgenceTelephone: p.contactUrgenceTelephone,
      contactUrgenceLien: p.contactUrgenceLien,
      acces: {
        codePortail: a.codePortail,
        codeImmeuble: a.codeImmeuble,
        etage: a.etage,
        digicodePorte: a.digicodePorte,
        emplacementCle: a.emplacementCle,
        presenceAnimal: a.presenceAnimal,
        descriptionAnimal: a.descriptionAnimal,
        detailsAidant: a.detailsAidant,
        stationnement: a.stationnement,
        notesAcces: a.notesAcces,
      },
      traitements: detail.treatments.map((t) => ({ libelle: t.libelle, dosage: t.dosage, passages: t.passages })),
      transmissions: detail.transmissions.slice(0, 5).map((t) => ({
        contenu: t.contenu,
        importance: t.importance,
        createdAt: t.createdAt,
        auteur: t.soignante.prenom,
      })),
      prochaines: detail.prochaines.slice(0, 3).map((v) => ({ date: v.date, tranche: v.tranche, actes: v.actes })),
    };
  }
  return { jour: DEMO_AUJOURDHUI, fiches };
}
