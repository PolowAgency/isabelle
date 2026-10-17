"use server";

import { revalidatePath } from "next/cache";
import { eq, and, gte, inArray, lte, ilike, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { authLookupSoignante, soignantePublicColumns, withSoignante } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prochaineCouleurSecteur } from "@/lib/couleurs";
import { nettoyerActes } from "@/lib/actes";
import { orDemo } from "@/lib/demo-data";
import { ErreurMetier, enResultat, type Resultat } from "@/lib/resultat";
import {
  creerTransfert,
  marquerReponseVue,
  repondreTransfert,
  type CibleTransfert,
} from "@/lib/transferts";
import {
  corrigerActesVisite,
  decalerVisiteAuLendemain,
  lireHistoriqueVisite,
} from "@/lib/visites";
import { getSignedDownloadUrl, buildObjectKey, isStorageConfigured, uploadObject } from "@/lib/storage";
import type {
  PatientAccess,
  PatientDocument,
  PatientTransmission,
} from "@/lib/patient-detail";
import type { SecteurOption } from "@/lib/patients";
import {
  createRemplacanteForSoignante,
  isIsabelleAdmin,
  updateRemplacanteForSoignante,
} from "@/lib/team";
import {
  accesDomicile,
  documents,
  ordonnances,
  patients,
  secteurs,
  soignantes,
  traitements,
  transmissions,
  visites,
} from "@/lib/schema";
import { updateVisiteStatut, type StatutVisite } from "@/lib/tournee";
import { TRANCHES, passageDeTranche, type Tranche } from "@/lib/tranches";
import {
  annulerVisiteSerie,
  creerSerieVisites,
  modifierVisiteSerie,
  type CreerSerieInput,
  type CreerSerieResultat,
  type PorteeModification,
} from "@/lib/series";

async function requireSoignanteId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié.");
  return session.user.id;
}

async function requireIsabelleAdminId(): Promise<string> {
  const soignanteId = await requireSoignanteId();
  const rows = await withSoignante(soignanteId, (tx) =>
    tx
      .select(soignantePublicColumns)
      .from(soignantes)
      .where(eq(soignantes.id, soignanteId))
      .limit(1)
  );

  const current = rows[0];
  if (!current || !isIsabelleAdmin(current)) {
    throw new Error("Accès réservé à Isabelle.");
  }

  return soignanteId;
}

function revalidateTournee() {
  revalidatePath("/");
  revalidatePath("/semaine");
}

/** Change le statut ; « faite » exige au moins un acte (fournis ici ou déjà sur la visite). */
export async function marquerVisiteAction(
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    await updateVisiteStatut(soignanteId, visiteId, statut, actes);
    return null;
  });
  revalidateTournee();
  return resultat;
}

/**
 * Crée une visite par tranche choisie, pour une même journée (ex. matin + midi
 * + soir en une seule action). Une tranche déjà occupée par ce patient ce
 * jour-là est ignorée, jamais dupliquée.
 */
export async function creerVisiteAction(input: {
  patientId: string;
  date: string;
  tranches: Tranche[];
  actes: string[];
  dureeEstimeeMin: number | null;
}): Promise<Resultat<{ crees: number; ignorees: number }>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const tranches = TRANCHES.filter((t) => input.tranches?.includes(t));
    if (tranches.length === 0) throw new ErreurMetier("Choisissez au moins une tranche horaire.");
    const actes = nettoyerActes(input.actes);

    return orDemo(
      () =>
        withSoignante(soignanteId, async (tx) => {
          // Dernier ordre par passage ; une seule requête pour toutes les tranches.
          const passages = Array.from(new Set(tranches.map(passageDeTranche)));
          const maxRows = await tx
            .select({
              passage: visites.passage,
              max: sql<number>`coalesce(max(${visites.ordreDansPassage}), 0)`,
            })
            .from(visites)
            .where(and(eq(visites.date, input.date), inArray(visites.passage, passages)))
            .groupBy(visites.passage);
          const ordreMax = new Map<string, number>(maxRows.map((r) => [r.passage, Number(r.max)]));

          const rows = tranches.map((tranche) => {
            const passage = passageDeTranche(tranche);
            const ordre = (ordreMax.get(passage) ?? 0) + 1;
            ordreMax.set(passage, ordre);
            return {
              patientId: input.patientId,
              soignanteId,
              date: input.date,
              tranche,
              ordreDansPassage: ordre,
              actes,
              dureeEstimeeMin: input.dureeEstimeeMin,
              statut: "prevue" as const,
            };
          });

          const inserted = await tx
            .insert(visites)
            .values(rows)
            .onConflictDoNothing()
            .returning({ id: visites.id });
          return { crees: inserted.length, ignorees: rows.length - inserted.length };
        }),
      () => ({ crees: tranches.length, ignorees: 0 })
    );
  });

  revalidateTournee();
  return resultat;
}

/** Soin récurrent : génère toutes les visites de la série en une transaction. */
export async function creerSerieVisitesAction(
  input: CreerSerieInput
): Promise<Resultat<CreerSerieResultat>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => creerSerieVisites(soignanteId, input));
  revalidateTournee();
  revalidatePath(`/patients/${input.patientId}`);
  return resultat;
}

export async function modifierVisiteAction(input: {
  visiteId: string;
  portee: PorteeModification;
  actes: string[];
  dureeEstimeeMin: number | null;
  tranche?: Tranche;
}) {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => modifierVisiteSerie(soignanteId, input));
  revalidateTournee();
  return resultat;
}

/** Annule (statut « annulee », jamais de suppression physique). Les visites déjà traitées ne sont pas touchées. */
export async function annulerVisiteAction(visiteId: string, portee: PorteeModification) {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => annulerVisiteSerie(soignanteId, { visiteId, portee }));
  revalidateTournee();
  return resultat;
}

/** Corrige les actes d'un passage, y compris déjà validé (journalisé). */
export async function corrigerActesAction(visiteId: string, actes: string[]): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    await corrigerActesVisite(soignanteId, visiteId, actes);
    return null;
  });
  revalidateTournee();
  return resultat;
}

/** Reporte une visite prévue à demain (même tranche) en un geste. */
export async function decalerVisiteAction(visiteId: string) {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => decalerVisiteAuLendemain(soignanteId, visiteId));
  revalidateTournee();
  return resultat;
}

export async function historiqueVisiteAction(visiteId: string) {
  const soignanteId = await requireSoignanteId();
  return lireHistoriqueVisite(soignanteId, visiteId);
}

/** Demande à une collègue de reprendre un patient, une visite ou une série. */
export async function creerTransfertAction(input: {
  cible: CibleTransfert;
  versSoignanteId: string;
  message?: string | null;
}): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    await creerTransfert(soignanteId, input);
    return null;
  });
  revalidatePath("/alertes");
  return resultat;
}

/** Accepte (les visites futures passent à la destinataire) ou refuse une demande reçue. */
export async function repondreTransfertAction(
  transfertId: string,
  decision: "accepte" | "refuse"
): Promise<Resultat<{ deplacees: number }>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => repondreTransfert(soignanteId, transfertId, decision));
  revalidateTournee();
  revalidatePath("/alertes");
  revalidatePath("/patients", "layout");
  return resultat;
}

export async function marquerReponseVueAction(transfertId: string) {
  const soignanteId = await requireSoignanteId();
  await marquerReponseVue(soignanteId, transfertId);
  revalidatePath("/alertes");
}

export type PatientRecherche = {
  id: string;
  prenom: string;
  nom: string;
  secteurNom: string | null;
};

export async function rechercherPatientsAction(query: string): Promise<PatientRecherche[]> {
  const soignanteId = await requireSoignanteId();
  const q = query.trim();
  if (q.length < 2) return [];

  return withSoignante(soignanteId, async (tx) => {
    const rows = await tx
      .select({
        id: patients.id,
        prenom: patients.prenom,
        nom: patients.nom,
        secteurNom: secteurs.nom,
      })
      .from(patients)
      .leftJoin(secteurs, eq(secteurs.id, patients.secteurId))
      .where(
        and(
          eq(patients.actif, true),
          or(
            ilike(patients.nom, `%${q}%`),
            ilike(patients.prenom, `%${q}%`),
            ilike(sql`${patients.prenom} || ' ' || ${patients.nom}`, `%${q}%`)
          )
        )
      )
      .limit(10);

    return rows;
  });
}

/** Copie toutes les visites d'un jour vers un autre (statut remis à "prevue"). Ignore les doublons déjà présents. */
export async function dupliquerJourAction(sourceDate: string, targetDate: string) {
  const soignanteId = await requireSoignanteId();

  await withSoignante(soignanteId, async (tx) => {
    const source = await tx.select().from(visites).where(eq(visites.date, sourceDate));
    if (source.length === 0) return;

    await tx
      .insert(visites)
      .values(
        source.map((v) => ({
          patientId: v.patientId,
          soignanteId: v.soignanteId,
          date: targetDate,
          tranche: v.tranche,
          ordreDansPassage: v.ordreDansPassage,
          actes: v.actes,
          dureeEstimeeMin: v.dureeEstimeeMin,
          statut: "prevue" as const,
        }))
      )
      .onConflictDoNothing();
  });

  revalidatePath("/");
  revalidatePath("/semaine");
}

/** Duplique une semaine complète (lundi -> dimanche) vers la semaine suivante (+7 jours). */
export async function genererSemaineSuivanteAction(mondayIso: string) {
  const soignanteId = await requireSoignanteId();

  const monday = new Date(`${mondayIso}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  await withSoignante(soignanteId, async (tx) => {
    const source = await tx
      .select()
      .from(visites)
      .where(and(gte(visites.date, mondayIso), lte(visites.date, sunday.toISOString().slice(0, 10))));

    if (source.length === 0) return;

    const rows = source.map((v) => {
      const d = new Date(`${v.date}T00:00:00`);
      d.setDate(d.getDate() + 7);
      return {
        patientId: v.patientId,
        soignanteId: v.soignanteId,
        date: d.toISOString().slice(0, 10),
        tranche: v.tranche,
        ordreDansPassage: v.ordreDansPassage,
        actes: v.actes,
        dureeEstimeeMin: v.dureeEstimeeMin,
        statut: "prevue" as const,
      };
    });

    for (let i = 0; i < rows.length; i += 400) {
      await tx.insert(visites).values(rows.slice(i, i + 400)).onConflictDoNothing();
    }
  });

  revalidatePath("/");
  revalidatePath("/semaine");
}

type AccessPatch = Partial<
  Pick<
    PatientAccess,
    | "codePortail"
    | "codeImmeuble"
    | "etage"
    | "digicodePorte"
    | "emplacementCle"
    | "presenceAnimal"
    | "descriptionAnimal"
    | "presenceAidant"
    | "detailsAidant"
    | "stationnement"
    | "notesAcces"
  >
>;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapAccessRow(
  row: typeof accesDomicile.$inferSelect | undefined,
  patientId: string
): PatientAccess {
  return {
    patientId,
    codePortail: row?.codePortail ?? null,
    codeImmeuble: row?.codeImmeuble ?? null,
    etage: row?.etage ?? null,
    digicodePorte: row?.digicodePorte ?? null,
    emplacementCle: row?.emplacementCle ?? null,
    presenceAnimal: row?.presenceAnimal ?? false,
    descriptionAnimal: row?.descriptionAnimal ?? null,
    presenceAidant: row?.presenceAidant ?? false,
    detailsAidant: row?.detailsAidant ?? null,
    stationnement: row?.stationnement ?? null,
    notesAcces: row?.notesAcces ?? null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function updatePatientAccessAction(input: {
  patientId: string;
  patch: AccessPatch;
}): Promise<PatientAccess> {
  const soignanteId = await requireSoignanteId();

  const normalizedPatch = {
    codePortail:
      input.patch.codePortail !== undefined ? normalizeText(input.patch.codePortail) : undefined,
    codeImmeuble:
      input.patch.codeImmeuble !== undefined
        ? normalizeText(input.patch.codeImmeuble)
        : undefined,
    etage: input.patch.etage !== undefined ? normalizeText(input.patch.etage) : undefined,
    digicodePorte:
      input.patch.digicodePorte !== undefined
        ? normalizeText(input.patch.digicodePorte)
        : undefined,
    emplacementCle:
      input.patch.emplacementCle !== undefined
        ? normalizeText(input.patch.emplacementCle)
        : undefined,
    presenceAnimal: input.patch.presenceAnimal,
    descriptionAnimal:
      input.patch.descriptionAnimal !== undefined
        ? normalizeText(input.patch.descriptionAnimal)
        : undefined,
    presenceAidant: input.patch.presenceAidant,
    detailsAidant:
      input.patch.detailsAidant !== undefined
        ? normalizeText(input.patch.detailsAidant)
        : undefined,
    stationnement:
      input.patch.stationnement !== undefined
        ? normalizeText(input.patch.stationnement)
        : undefined,
    notesAcces:
      input.patch.notesAcces !== undefined
        ? normalizeText(input.patch.notesAcces)
        : undefined,
  };

  const rows = await withSoignante(soignanteId, async (tx) => {
    const [row] = await tx
      .insert(accesDomicile)
      .values({
        patientId: input.patientId,
        updatedBy: soignanteId,
        ...normalizedPatch,
      })
      .onConflictDoUpdate({
        target: accesDomicile.patientId,
        set: {
          ...normalizedPatch,
          updatedAt: new Date(),
          updatedBy: soignanteId,
        },
      })
      .returning();

    return row;
  });

  revalidatePath(`/patients/${input.patientId}`);
  return mapAccessRow(rows, input.patientId);
}

export async function addTransmissionAction(input: {
  patientId: string;
  contenu: string;
  importance: "info" | "attention" | "urgent";
}): Promise<PatientTransmission> {
  const soignanteId = await requireSoignanteId();
  const contenu = input.contenu.trim();
  if (!contenu) {
    throw new Error("Le message est vide.");
  }

  const transmission = await withSoignante(soignanteId, async (tx) => {
    const [created] = await tx
      .insert(transmissions)
      .values({
        patientId: input.patientId,
        soignanteId,
        contenu,
        importance: input.importance,
        luePar: [soignanteId],
      })
      .returning();

    const rows = await tx
      .select({
        id: transmissions.id,
        contenu: transmissions.contenu,
        importance: transmissions.importance,
        luePar: transmissions.luePar,
        createdAt: transmissions.createdAt,
        soignanteId: soignantes.id,
        soignantePrenom: soignantes.prenom,
        soignanteNom: soignantes.nom,
        soignanteCouleur: soignantes.couleur,
      })
      .from(transmissions)
      .innerJoin(soignantes, eq(soignantes.id, transmissions.soignanteId))
      .where(eq(transmissions.id, created.id))
      .limit(1);

    return rows[0];
  });

  revalidatePath(`/patients/${input.patientId}`);
  revalidatePath("/alertes");

  return {
    id: transmission.id,
    contenu: transmission.contenu,
    importance: transmission.importance,
    luePar: transmission.luePar,
    isRead: true,
    createdAt: transmission.createdAt.toISOString(),
    soignante: {
      id: transmission.soignanteId,
      prenom: transmission.soignantePrenom,
      nom: transmission.soignanteNom,
      couleur: transmission.soignanteCouleur,
    },
  };
}

export async function markTransmissionReadAction(
  transmissionId: string
): Promise<{ transmissionId: string }> {
  const soignanteId = await requireSoignanteId();

  const patientRows = await withSoignante(soignanteId, async (tx) => {
    const rows = await tx
      .select({
        patientId: transmissions.patientId,
        luePar: transmissions.luePar,
      })
      .from(transmissions)
      .where(eq(transmissions.id, transmissionId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error("Transmission introuvable.");
    }

    if (!row.luePar.includes(soignanteId)) {
      await tx
        .update(transmissions)
        .set({
          luePar: [...row.luePar, soignanteId],
        })
        .where(eq(transmissions.id, transmissionId));
    }

    return row.patientId;
  });

  revalidatePath(`/patients/${patientRows}`);
  revalidatePath("/alertes");

  return { transmissionId };
}

// Vercel limite le corps d'une requête à 4,5 Mo : les photos sont réduites côté
// navigateur avant envoi (voir lib/image-client.ts), les PDF doivent rester sous 4 Mo.
const MAX_DOCUMENT_SIZE_BYTES = 4 * 1024 * 1024; // 4 Mo
const ALLOWED_DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export async function uploadPatientDocumentAction(
  formData: FormData
): Promise<PatientDocument> {
  const soignanteId = await requireSoignanteId();
  const patientId = String(formData.get("patientId") ?? "");
  const legende = normalizeText(String(formData.get("legende") ?? ""));
  const file = formData.get("file");

  if (!patientId) {
    throw new Error("Patient introuvable.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Aucun fichier reçu.");
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("Fichier trop volumineux (4 Mo maximum).");
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    throw new Error("Type de fichier non autorisé (photo ou PDF uniquement).");
  }

  if (!isStorageConfigured()) {
    throw new Error("Le stockage S3 n'est pas encore configuré.");
  }

  const contentType = file.type || "application/octet-stream";
  const kind = file.type.startsWith("image/") ? "photo" : "document";
  const key = buildObjectKey(patientId, "documents", file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadObject(key, buffer, contentType);

  const [created] = await withSoignante(soignanteId, (tx) =>
    tx
      .insert(documents)
      .values({
        patientId,
        soignanteId,
        type: kind,
        fichierKey: key,
        legende,
      })
      .returning()
  );

  revalidatePath(`/patients/${patientId}`);

  return {
    id: created.id,
    type: created.type,
    legende: created.legende,
    createdAt: created.createdAt.toISOString(),
    signedUrl: await getSignedDownloadUrl(created.fichierKey),
    filename: created.fichierKey.split("/").pop() ?? created.fichierKey,
    isImage: /\.(png|jpe?g|gif|webp|heic)$/i.test(created.fichierKey),
  };
}

export type CreatePatientInput = {
  prenom: string;
  nom: string;
  dateNaissance: string | null;
  telephone: string | null;
  adresse: string | null;
  complementAdresse: string | null;
  codePostal: string | null;
  ville: string | null;
  secteurId: string | null;
  contactUrgenceNom: string | null;
  contactUrgenceTelephone: string | null;
  contactUrgenceLien: string | null;
  medecinTraitantNom: string | null;
  medecinTraitantTelephone: string | null;
};

export async function creerPatientAction(
  input: CreatePatientInput
): Promise<{ id: string }> {
  const soignanteId = await requireSoignanteId();
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();

  if (!prenom || !nom) {
    throw new Error("Prénom et nom sont obligatoires.");
  }

  const [created] = await withSoignante(soignanteId, (tx) =>
    tx
      .insert(patients)
      .values({
        prenom,
        nom,
        dateNaissance: input.dateNaissance || null,
        telephone: normalizeText(input.telephone),
        adresse: normalizeText(input.adresse),
        complementAdresse: normalizeText(input.complementAdresse),
        codePostal: normalizeText(input.codePostal),
        ville: normalizeText(input.ville),
        secteurId: input.secteurId || null,
        contactUrgenceNom: normalizeText(input.contactUrgenceNom),
        contactUrgenceTelephone: normalizeText(input.contactUrgenceTelephone),
        contactUrgenceLien: normalizeText(input.contactUrgenceLien),
        medecinTraitantNom: normalizeText(input.medecinTraitantNom),
        medecinTraitantTelephone: normalizeText(input.medecinTraitantTelephone),
        createdBy: soignanteId,
      })
      .returning({ id: patients.id })
  );

  revalidatePath("/patients");

  return created;
}

export async function creerSecteurAction(nom: string): Promise<SecteurOption> {
  const soignanteId = await requireSoignanteId();
  const trimmed = nom.trim();

  if (!trimmed) {
    throw new Error("Le nom du secteur est obligatoire.");
  }

  const created = await withSoignante(soignanteId, async (tx) => {
    const existing = await tx
      .select({ couleur: secteurs.couleur, ordre: secteurs.ordre })
      .from(secteurs);

    const ordreMax = existing.reduce((max, s) => Math.max(max, s.ordre), 0);

    const [row] = await tx
      .insert(secteurs)
      .values({
        nom: trimmed,
        ordre: ordreMax + 1,
        couleur: prochaineCouleurSecteur(existing.map((s) => s.couleur)),
      })
      .returning();

    return row;
  });

  revalidatePath("/patients");
  revalidatePath("/patients/nouveau");

  return created;
}

export async function createRemplacanteAction(input: {
  role?: "titulaire" | "remplacante";
  prenom: string;
  nom: string;
  email: string;
  remplaceId: string | null;
  dateDebut: string;
  dateFin: string | null;
}) {
  const soignanteId = await requireIsabelleAdminId();
  const result = await createRemplacanteForSoignante(soignanteId, input);
  revalidatePath("/compte");
  revalidatePath("/compte/nouvelle-remplacante");
  return result;
}

export async function updateRemplacanteAction(input: {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  remplaceId: string | null;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
}) {
  const soignanteId = await requireIsabelleAdminId();
  await updateRemplacanteForSoignante(soignanteId, input);
  revalidatePath("/compte");
  revalidatePath(`/compte/remplacantes/${input.id}`);
}

export async function changerMotDePasseAction(
  motDePasseActuel: string,
  nouveauMotDePasse: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const soignanteId = await requireSoignanteId();

  if (nouveauMotDePasse.length < 10) {
    return { ok: false, error: "Le nouveau mot de passe doit faire au moins 10 caractères." };
  }
  if (nouveauMotDePasse === motDePasseActuel) {
    return { ok: false, error: "Choisis un mot de passe différent de l'actuel." };
  }

  const rows = await withSoignante(soignanteId, (tx) =>
    tx
      .select({ email: soignantes.email })
      .from(soignantes)
      .where(eq(soignantes.id, soignanteId))
      .limit(1)
  );
  const email = rows[0]?.email;
  const compte = email ? await authLookupSoignante(email) : null;

  if (!compte || !(await verifyPassword(compte.passwordHash, motDePasseActuel))) {
    return { ok: false, error: "Le mot de passe actuel est incorrect." };
  }

  const passwordHash = await hashPassword(nouveauMotDePasse);
  await withSoignante(soignanteId, (tx) =>
    tx.update(soignantes).set({ passwordHash }).where(eq(soignantes.id, soignanteId))
  );

  return { ok: true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateOuNull(value: FormDataEntryValue | string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return ISO_DATE.test(text) ? text : null;
}

export async function creerOrdonnanceAction(formData: FormData): Promise<void> {
  const soignanteId = await requireSoignanteId();
  const patientId = String(formData.get("patientId") ?? "");
  const file = formData.get("file");

  if (!patientId) throw new Error("Patient introuvable.");

  let fichierKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new Error("Fichier trop volumineux (4 Mo maximum).");
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
      throw new Error("Type de fichier non autorisé (photo ou PDF uniquement).");
    }
    if (!isStorageConfigured()) {
      throw new Error("Le stockage de fichiers n'est pas encore configuré.");
    }
    fichierKey = buildObjectKey(patientId, "ordonnances", file.name);
    await uploadObject(fichierKey, Buffer.from(await file.arrayBuffer()), file.type);
  }

  const prescripteur = normalizeText(String(formData.get("prescripteur") ?? ""));
  const description = normalizeText(String(formData.get("description") ?? ""));
  const datePrescription = dateOuNull(formData.get("datePrescription"));
  const dateFin = dateOuNull(formData.get("dateFin"));

  if (!prescripteur && !description && !fichierKey && !dateFin) {
    throw new Error("Renseigne au moins le prescripteur, une description, une date de fin ou un fichier.");
  }

  await withSoignante(soignanteId, (tx) =>
    tx.insert(ordonnances).values({
      patientId,
      prescripteur,
      description,
      datePrescription,
      dateDebut: datePrescription,
      dateFin,
      fichierKey,
      createdBy: soignanteId,
    })
  );

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/alertes");
}

export async function archiverOrdonnanceAction(ordonnanceId: string, patientId: string) {
  const soignanteId = await requireSoignanteId();
  await withSoignante(soignanteId, (tx) =>
    tx.update(ordonnances).set({ active: false }).where(eq(ordonnances.id, ordonnanceId))
  );
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/alertes");
}

export async function creerTraitementAction(input: {
  patientId: string;
  libelle: string;
  dosage: string;
  passages: string[];
  notes: string;
}) {
  const soignanteId = await requireSoignanteId();
  const libelle = input.libelle.trim();
  if (!input.patientId) throw new Error("Patient introuvable.");
  if (!libelle) throw new Error("Le nom du traitement est obligatoire.");

  const passages = input.passages.filter((p) => ["matin", "midi", "soir"].includes(p));

  await withSoignante(soignanteId, (tx) =>
    tx.insert(traitements).values({
      patientId: input.patientId,
      libelle,
      dosage: normalizeText(input.dosage),
      passages,
      notes: normalizeText(input.notes),
    })
  );
  revalidatePath(`/patients/${input.patientId}`);
}

export async function arreterTraitementAction(traitementId: string, patientId: string) {
  const soignanteId = await requireSoignanteId();
  await withSoignante(soignanteId, (tx) =>
    tx.update(traitements).set({ actif: false }).where(eq(traitements.id, traitementId))
  );
  revalidatePath(`/patients/${patientId}`);
}
