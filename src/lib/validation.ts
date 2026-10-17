import { z } from "zod";
import { ACTES } from "@/lib/actes";
import { isDemoModeEnabled } from "@/lib/demo-data";
import { estDateISOValide } from "@/lib/date";
import { ErreurMetier } from "@/lib/resultat";
import { FREQUENCES_SERIE } from "@/lib/schema";
import { TRANCHES } from "@/lib/tranches";

// Validation de TOUTES les entrées des Server Actions et routes API. Les
// messages sont en français, lisibles, sans trace technique ni valeur saisie
// (une valeur peut être une donnée de santé).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuid = z
  .string({ required_error: "Identifiant manquant.", invalid_type_error: "Identifiant invalide." })
  .refine(
    // Le mode démo utilise des identifiants courts (p1, s2…) ; jamais en production.
    (v) => UUID.test(v) || (isDemoModeEnabled() && /^[\w-]{1,40}$/.test(v)),
    "Identifiant invalide."
  );

export const dateISO = z
  .string({ required_error: "Date manquante.", invalid_type_error: "Date invalide." })
  .refine(estDateISOValide, "Date invalide.");

/** Texte libre : coupé aux espaces, borné. */
export const texte = (max: number, nom = "Le texte") =>
  z
    .string({ invalid_type_error: `${nom} est invalide.` })
    .trim()
    .max(max, `${nom} est trop long (${max} caractères maximum).`);

export const texteObligatoire = (max: number, nom: string) =>
  texte(max, nom).min(1, `${nom} est obligatoire.`);

/** Chaîne vide -> null (champs de formulaire facultatifs). */
export const texteOptionnel = (max: number, nom = "Le texte") =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string().max(max, `${nom} est trop long (${max} caractères maximum).`))
    .transform((v) => (v === "" ? null : v));

export const dateOptionnelle = z
  .union([dateISO, z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v ? v : null));

export const statutVisite = z.enum(["prevue", "faite", "absent", "reportee", "annulee"], {
  errorMap: () => ({ message: "Statut invalide." }),
});
export const passage = z.enum(["matin", "midi", "soir"], {
  errorMap: () => ({ message: "Passage invalide." }),
});
export const tranche = z.enum(TRANCHES, { errorMap: () => ({ message: "Tranche horaire invalide." }) });
export const importance = z.enum(["info", "attention", "urgent"], {
  errorMap: () => ({ message: "Importance invalide." }),
});
export const frequence = z.enum(FREQUENCES_SERIE, { errorMap: () => ({ message: "Fréquence invalide." }) });

export const tranches = z
  .array(tranche, { invalid_type_error: "Tranches invalides." })
  .min(1, "Choisissez au moins une tranche horaire.")
  .max(TRANCHES.length, "Trop de tranches.");

/**
 * Actes : forme seulement (chaînes courtes, 20 au plus). La liste blanche
 * (ACTES, plus les actes déjà portés par la visite) est appliquée par
 * nettoyerActes, dans la logique métier, car elle dépend de la visite.
 */
export const actes = z
  .array(z.string().max(60, "Libellé d'acte trop long."), { invalid_type_error: "Actes invalides." })
  .max(20, "Trop d'actes.");

export const duree = z
  .number({ invalid_type_error: "Durée invalide." })
  .int("Durée invalide.")
  .min(1, "Durée invalide.")
  .max(600, "Durée invalide.")
  .nullable();

export const joursSemaine = z
  .array(z.number().int().min(1).max(7), { invalid_type_error: "Jours invalides." })
  .max(7, "Jours invalides.")
  .optional();

export const LISTE_BLANCHE_ACTES = new Set(ACTES.map((a) => a.value));

// ---------------------------------------------------------------------------
// Application d'un schéma
// ---------------------------------------------------------------------------

/**
 * Valide `valeur` ; échec -> ErreurMetier avec le premier message lisible
 * (jamais la valeur reçue ni le chemin technique du champ).
 */
export function valider<S extends z.ZodTypeAny>(schema: S, valeur: unknown): z.output<S> {
  const resultat = schema.safeParse(valeur);
  if (resultat.success) return resultat.data;
  const message = resultat.error.issues[0]?.message;
  throw new ErreurMetier(
    message && !/^Required$|^Expected|^Invalid/.test(message) ? message : "Données invalides."
  );
}

// ---------------------------------------------------------------------------
// Schémas des actions
// ---------------------------------------------------------------------------

const operationHorsLigne = z.discriminatedUnion("type", [
  z.object({
    id: uuid,
    type: z.literal("marquer"),
    visiteId: uuid,
    statut: z.enum(["faite", "absent"], { errorMap: () => ({ message: "Statut invalide." }) }),
    actes: actes.optional(),
    statutConnu: statutVisite,
    creeLe: z.number().finite(),
  }),
  z.object({
    id: uuid,
    type: z.literal("decaler"),
    visiteId: uuid,
    statutConnu: statutVisite,
    creeLe: z.number().finite(),
  }),
]);

const endpointPush = z
  .string({ required_error: "Appareil invalide.", invalid_type_error: "Appareil invalide." })
  .max(600, "Appareil invalide.")
  .url("Appareil invalide.")
  .refine((v) => v.startsWith("https://"), "Appareil invalide.");

const cleBase64Url = z
  .string({ required_error: "Clé invalide.", invalid_type_error: "Clé invalide." })
  .min(8, "Clé invalide.")
  .max(200, "Clé invalide.")
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Clé invalide.");

export const schemas = {
  pushAbonnement: z.object({
    endpoint: endpointPush,
    keys: z.object({ p256dh: cleBase64Url, auth: cleBase64Url }),
    notifierTransferts: z.boolean().default(true),
    notifierUrgences: z.boolean().default(true),
  }),
  pushDesabonnement: z.object({ endpoint: endpointPush }),
  operationsHorsLigne: z.object({
    operations: z.array(operationHorsLigne, { invalid_type_error: "Opérations invalides." }).max(100, "Trop d'opérations d'un coup."),
  }),
  marquerVisite: z.object({ visiteId: uuid, statut: statutVisite, actes: actes.optional() }),
  creerVisite: z.object({
    patientId: uuid,
    date: dateISO,
    tranches,
    actes,
    dureeEstimeeMin: duree,
  }),
  creerSerie: z.object({
    patientId: uuid,
    dateDebut: dateISO,
    frequence,
    joursSemaine,
    tranches,
    actes,
    dureeEstimeeMin: duree,
    fin: z.discriminatedUnion("type", [
      z.object({ type: z.literal("date"), dateFin: dateISO }),
      z.object({
        type: z.literal("duree"),
        unite: z.enum(["jours", "semaines", "mois"], { errorMap: () => ({ message: "Unité invalide." }) }),
        nombre: z.number({ invalid_type_error: "Durée invalide." }).int("Durée invalide.").min(1, "Durée invalide.").max(366, "Durée invalide."),
      }),
    ]),
  }),
  portee: z.enum(["cette", "suivantes"], { errorMap: () => ({ message: "Portée invalide." }) }),
  modifierVisite: z.object({
    visiteId: uuid,
    portee: z.enum(["cette", "suivantes"], { errorMap: () => ({ message: "Portée invalide." }) }),
    actes,
    dureeEstimeeMin: duree,
    tranche: tranche.optional(),
  }),
  transfert: z.object({
    cible: z.object({
      type: z.enum(["patient", "visite", "serie"], { errorMap: () => ({ message: "Cible invalide." }) }),
      id: uuid,
    }),
    versSoignanteId: uuid,
    message: texteOptionnel(500, "Le message"),
  }),
  decisionTransfert: z.enum(["accepte", "refuse"], { errorMap: () => ({ message: "Réponse invalide." }) }),
  rechercheTexte: z.string().max(100),
  duplicationJour: z.object({ source: dateISO, cible: dateISO }),
  transmission: z.object({
    patientId: uuid,
    contenu: texteObligatoire(4000, "Le message"),
    importance,
  }),
  accesPatch: z.object({
    codePortail: texteOptionnel(100).optional(),
    codeImmeuble: texteOptionnel(100).optional(),
    etage: texteOptionnel(100).optional(),
    digicodePorte: texteOptionnel(100).optional(),
    emplacementCle: texteOptionnel(300).optional(),
    presenceAnimal: z.boolean().optional(),
    descriptionAnimal: texteOptionnel(300).optional(),
    presenceAidant: z.boolean().optional(),
    detailsAidant: texteOptionnel(300).optional(),
    stationnement: texteOptionnel(300).optional(),
    notesAcces: texteOptionnel(2000).optional(),
  }),
  patient: z.object({
    prenom: texteObligatoire(80, "Le prénom"),
    nom: texteObligatoire(80, "Le nom"),
    dateNaissance: dateOptionnelle,
    telephone: texteOptionnel(30, "Le téléphone"),
    adresse: texteOptionnel(200, "L'adresse"),
    complementAdresse: texteOptionnel(200, "Le complément d'adresse"),
    codePostal: texteOptionnel(10, "Le code postal"),
    ville: texteOptionnel(100, "La ville"),
    secteurId: z.union([uuid, z.literal(""), z.null()]).transform((v) => (v ? v : null)),
    contactUrgenceNom: texteOptionnel(100, "Le contact d'urgence"),
    contactUrgenceTelephone: texteOptionnel(30, "Le téléphone du contact"),
    contactUrgenceLien: texteOptionnel(60, "Le lien avec le patient"),
    medecinTraitantNom: texteOptionnel(100, "Le médecin"),
    medecinTraitantTelephone: texteOptionnel(30, "Le téléphone du médecin"),
  }),
  secteur: texteObligatoire(80, "Le nom du secteur"),
  creerCompte: z.object({
    role: z.enum(["titulaire", "remplacante"]).optional(),
    prenom: texteObligatoire(80, "Le prénom"),
    nom: texteObligatoire(80, "Le nom"),
    email: texteObligatoire(254, "L'email").pipe(z.string().email("Email invalide.")).transform((v) => v.toLowerCase()),
    remplaceId: z.union([uuid, z.literal(""), z.null()]).transform((v) => (v ? v : null)),
    dateDebut: dateISO,
    dateFin: dateOptionnelle,
  }),
  modifierCompte: z.object({
    id: uuid,
    prenom: texteObligatoire(80, "Le prénom"),
    nom: texteObligatoire(80, "Le nom"),
    email: texteObligatoire(254, "L'email").pipe(z.string().email("Email invalide.")).transform((v) => v.toLowerCase()),
    remplaceId: z.union([uuid, z.literal(""), z.null()]).transform((v) => (v ? v : null)),
    dateDebut: dateISO,
    dateFin: dateOptionnelle,
    actif: z.boolean(),
  }),
  motsDePasse: z.object({
    actuel: z.string().min(1, "Saisissez le mot de passe actuel.").max(1024, "Mot de passe trop long."),
    nouveau: z
      .string()
      .min(10, "Le nouveau mot de passe doit faire au moins 10 caractères.")
      .max(1024, "Mot de passe trop long."),
  }),
  ordonnance: z.object({
    patientId: uuid,
    prescripteur: texteOptionnel(150, "Le prescripteur"),
    description: texteOptionnel(1000, "La description"),
    datePrescription: dateOptionnelle,
    dateFin: dateOptionnelle,
  }),
  traitement: z.object({
    patientId: uuid,
    libelle: texteObligatoire(150, "Le nom du traitement"),
    dosage: texteOptionnel(150, "Le dosage"),
    passages: z.array(passage).max(3, "Passages invalides."),
    notes: texteOptionnel(1000, "Les notes"),
  }),
  periodeExport: z.object({ du: dateISO, au: dateISO, soignante: uuid.nullable() }),
  legendeDocument: texteOptionnel(200, "La légende"),
};
