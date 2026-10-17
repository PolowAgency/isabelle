import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  date,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql, type InferSelectModel } from "drizzle-orm";
import { TRANCHES } from "@/lib/tranches";

// Reflète migrations/0001_init.sql, 0002, 0003… — toute évolution de schéma doit être
// faite dans une nouvelle migration SQL, puis répercutée ici.

export const soignantes = pgTable("soignantes", {
  id: uuid("id").primaryKey().defaultRandom(),
  prenom: text("prenom").notNull(),
  nom: text("nom").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  couleur: text("couleur").notNull().default("#25453a"),
  role: text("role", { enum: ["titulaire", "remplacante"] }).notNull(),
  actif: boolean("actif").notNull().default(true),
  remplaceId: uuid("remplace_id"),
  estAdmin: boolean("est_admin").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(0),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  dateDebut: date("date_debut").notNull().defaultNow(),
  dateFin: date("date_fin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secteurs = pgTable("secteurs", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  ordre: integer("ordre").notNull().default(0),
  couleur: text("couleur").notNull().default("#a9c4ab"),
});

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  prenom: text("prenom").notNull(),
  nom: text("nom").notNull(),
  dateNaissance: date("date_naissance"),
  telephone: text("telephone"),
  adresse: text("adresse"),
  complementAdresse: text("complement_adresse"),
  codePostal: text("code_postal"),
  ville: text("ville"),
  secteurId: uuid("secteur_id").references(() => secteurs.id, { onDelete: "set null" }),
  actif: boolean("actif").notNull().default(true),
  contactUrgenceNom: text("contact_urgence_nom"),
  contactUrgenceTelephone: text("contact_urgence_telephone"),
  contactUrgenceLien: text("contact_urgence_lien"),
  medecinTraitantNom: text("medecin_traitant_nom"),
  medecinTraitantTelephone: text("medecin_traitant_telephone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => soignantes.id, { onDelete: "set null" }),
});

export const accesDomicile = pgTable("acces_domicile", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().unique().references(() => patients.id, { onDelete: "cascade" }),
  codePortail: text("code_portail"),
  codeImmeuble: text("code_immeuble"),
  etage: text("etage"),
  digicodePorte: text("digicode_porte"),
  emplacementCle: text("emplacement_cle"),
  presenceAnimal: boolean("presence_animal").notNull().default(false),
  descriptionAnimal: text("description_animal"),
  presenceAidant: boolean("presence_aidant").notNull().default(false),
  detailsAidant: text("details_aidant"),
  stationnement: text("stationnement"),
  notesAcces: text("notes_acces"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => soignantes.id, { onDelete: "set null" }),
});

export const FREQUENCES_SERIE = [
  "quotidien",
  "un_jour_sur_deux",
  "une_semaine_sur_deux",
  "jours_semaine",
] as const;
export type FrequenceSerie = (typeof FREQUENCES_SERIE)[number];

export const seriesVisites = pgTable("series_visites", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  soignanteId: uuid("soignante_id").notNull().references(() => soignantes.id),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  frequence: text("frequence", { enum: FREQUENCES_SERIE }).notNull(),
  joursSemaine: smallint("jours_semaine").array().notNull().default([]),
  tranches: text("tranches", { enum: TRANCHES }).array().notNull(),
  actes: text("actes").array().notNull().default([]),
  dureeEstimeeMin: integer("duree_estimee_min"),
  createdBy: uuid("created_by").references(() => soignantes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visites = pgTable(
  "visites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
    soignanteId: uuid("soignante_id").notNull().references(() => soignantes.id),
    date: date("date").notNull(),
    tranche: text("tranche", { enum: TRANCHES }).notNull(),
    // Colonne générée depuis `tranche` (migration 0005) : lecture seule.
    passage: text("passage", { enum: ["matin", "midi", "soir"] })
      .notNull()
      .generatedAlwaysAs(
        sql`case when tranche in ('6-8', '8-10', '10-12') then 'matin' when tranche in ('12-14', '14-16') then 'midi' else 'soir' end`
      ),
    ordreDansPassage: integer("ordre_dans_passage").notNull().default(0),
    actes: text("actes").array().notNull().default([]),
    dureeEstimeeMin: integer("duree_estimee_min"),
    statut: text("statut", {
      enum: ["prevue", "faite", "absent", "reportee", "annulee"],
    }).notNull().default("prevue"),
    heureReelle: timestamp("heure_reelle", { withTimezone: true }),
    // Heure d'arrivée chez le patient (migration 0011), distincte de la validation.
    heureArrivee: timestamp("heure_arrivee", { withTimezone: true }),
    serieId: uuid("serie_id").references(() => seriesVisites.id, { onDelete: "set null" }),
    // Visite d'origine quand celle-ci est un report « au lendemain » (migration 0006).
    reportDeId: uuid("report_de_id").references((): AnyPgColumn => visites.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.patientId, t.date, t.tranche)]
);

export const CHAMPS_HISTORIQUE = ["statut", "actes", "tranche", "date", "soignante"] as const;
export type ChampHistorique = (typeof CHAMPS_HISTORIQUE)[number];

export const visitesHistorique = pgTable("visites_historique", {
  id: uuid("id").primaryKey().defaultRandom(),
  visiteId: uuid("visite_id").notNull().references(() => visites.id, { onDelete: "cascade" }),
  soignanteId: uuid("soignante_id").references(() => soignantes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  champ: text("champ", { enum: CHAMPS_HISTORIQUE }).notNull(),
  ancienneValeur: text("ancienne_valeur"),
  nouvelleValeur: text("nouvelle_valeur"),
});

export const STATUTS_TRANSFERT = ["en_attente", "accepte", "refuse"] as const;
export type StatutTransfert = (typeof STATUTS_TRANSFERT)[number];

export const transferts = pgTable("transferts", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "cascade" }),
  visiteId: uuid("visite_id").references(() => visites.id, { onDelete: "cascade" }),
  serieId: uuid("serie_id").references(() => seriesVisites.id, { onDelete: "cascade" }),
  deSoignanteId: uuid("de_soignante_id").notNull().references(() => soignantes.id),
  versSoignanteId: uuid("vers_soignante_id").notNull().references(() => soignantes.id),
  statut: text("statut", { enum: STATUTS_TRANSFERT }).notNull().default("en_attente"),
  message: text("message"),
  reponseVue: boolean("reponse_vue").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  traiteAt: timestamp("traite_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  soignanteId: uuid("soignante_id").references(() => soignantes.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entite: text("entite").notNull(),
  entiteId: uuid("entite_id"),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  soignanteId: uuid("soignante_id").notNull().references(() => soignantes.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  notifierTransferts: boolean("notifier_transferts").notNull().default(true),
  notifierUrgences: boolean("notifier_urgences").notNull().default(true),
  consentiLe: timestamp("consenti_le", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transmissions = pgTable("transmissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  visiteId: uuid("visite_id").references(() => visites.id, { onDelete: "set null" }),
  soignanteId: uuid("soignante_id").notNull().references(() => soignantes.id),
  contenu: text("contenu").notNull(),
  importance: text("importance", { enum: ["info", "attention", "urgent"] }).notNull().default("info"),
  luePar: uuid("lue_par").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ordonnances = pgTable("ordonnances", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  prescripteur: text("prescripteur"),
  datePrescription: date("date_prescription"),
  dateDebut: date("date_debut"),
  dateFin: date("date_fin"),
  description: text("description"),
  fichierKey: text("fichier_key"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => soignantes.id, { onDelete: "set null" }),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  soignanteId: uuid("soignante_id").notNull().references(() => soignantes.id),
  type: text("type", { enum: ["photo", "document"] }).notNull(),
  fichierKey: text("fichier_key").notNull(),
  legende: text("legende"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const traitements = pgTable("traitements", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  dosage: text("dosage"),
  passages: text("passages").array().notNull().default([]),
  actif: boolean("actif").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Soignante = InferSelectModel<typeof soignantes>;
export type PublicSoignante = Omit<Soignante, "passwordHash">;
export type Secteur = InferSelectModel<typeof secteurs>;
export type Patient = InferSelectModel<typeof patients>;
export type AccesDomicile = InferSelectModel<typeof accesDomicile>;
export type SerieVisites = InferSelectModel<typeof seriesVisites>;
export type VisiteHistorique = InferSelectModel<typeof visitesHistorique>;
export type Transfert = InferSelectModel<typeof transferts>;
export type Visite = InferSelectModel<typeof visites>;
export type Transmission = InferSelectModel<typeof transmissions>;
export type Ordonnance = InferSelectModel<typeof ordonnances>;
export type DocumentPatient = InferSelectModel<typeof documents>;
export type Traitement = InferSelectModel<typeof traitements>;
