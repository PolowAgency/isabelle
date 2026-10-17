"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { eq, and, gte, inArray, lte, ne, ilike, or, sql } from "drizzle-orm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { authLookupSoignante, withSoignante } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prochaineCouleurSecteur } from "@/lib/couleurs";
import { nettoyerActes } from "@/lib/actes";
import { auditer, auditerSeul } from "@/lib/audit";
import { ajouterJours } from "@/lib/date";
import { orDemo } from "@/lib/demo-data";
import { ErreurMetier, enResultat, type Resultat } from "@/lib/resultat";
import { schemas, valider, uuid } from "@/lib/validation";
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
import { notifier } from "@/lib/push";
import { getSignedDownloadUrl } from "@/lib/storage";
import { enregistrerFichier } from "@/lib/upload";
import { chiffrerPatchAcces, lireAcces } from "@/lib/acces";
import type { PatientAccess, PatientDocument, PatientTransmission } from "@/lib/patient-detail";
import type { SecteurOption } from "@/lib/patients";
import {
  createRemplacanteForSoignante,
  isAdmin,
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

// Toutes les actions : session vérifiée (soignante active, session non révoquée,
// mot de passe définitif), entrées validées avec zod, erreurs « métier » renvoyées
// en Resultat (en production Next masque le message d'une exception).

async function requireSoignanteId(): Promise<string> {
  return (await getCurrentSoignante()).id;
}

async function requireAdminId(): Promise<string> {
  const current = await getCurrentSoignante();
  if (!isAdmin(current)) {
    throw new Error("Accès réservé aux administrateurs.");
  }
  return current.id;
}

function revalidateTournee() {
  revalidatePath("/");
  revalidatePath("/semaine");
}

// ---------------------------------------------------------------------------
// Visites
// ---------------------------------------------------------------------------

/** Change le statut ; « faite » exige au moins un acte (fournis ici ou déjà sur la visite). */
export async function marquerVisiteAction(
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    const entree = valider(schemas.marquerVisite, { visiteId, statut, actes });
    await updateVisiteStatut(soignanteId, entree.visiteId, entree.statut, entree.actes);
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
    const entree = valider(schemas.creerVisite, input);
    const tranches = TRANCHES.filter((t) => entree.tranches.includes(t));
    const actes = nettoyerActes(entree.actes);

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
            .where(and(eq(visites.date, entree.date), inArray(visites.passage, passages)))
            .groupBy(visites.passage);
          const ordreMax = new Map<string, number>(maxRows.map((r) => [r.passage, Number(r.max)]));

          const rows = tranches.map((tranche) => {
            const passage = passageDeTranche(tranche);
            const ordre = (ordreMax.get(passage) ?? 0) + 1;
            ordreMax.set(passage, ordre);
            return {
              patientId: entree.patientId,
              soignanteId,
              date: entree.date,
              tranche,
              ordreDansPassage: ordre,
              actes,
              dureeEstimeeMin: entree.dureeEstimeeMin,
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
  const resultat = await enResultat(() =>
    creerSerieVisites(soignanteId, valider(schemas.creerSerie, input) as CreerSerieInput)
  );
  revalidateTournee();
  if (typeof input?.patientId === "string") revalidatePath(`/patients/${input.patientId}`);
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
  const resultat = await enResultat(() =>
    modifierVisiteSerie(soignanteId, valider(schemas.modifierVisite, input))
  );
  revalidateTournee();
  return resultat;
}

/** Annule (statut « annulee », jamais de suppression physique). Les visites déjà traitées ne sont pas touchées. */
export async function annulerVisiteAction(visiteId: string, portee: PorteeModification) {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() =>
    annulerVisiteSerie(soignanteId, {
      visiteId: valider(uuid, visiteId),
      portee: valider(schemas.portee, portee),
    })
  );
  revalidateTournee();
  return resultat;
}

/** Corrige les actes d'un passage, y compris déjà validé (journalisé). */
export async function corrigerActesAction(visiteId: string, actes: string[]): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    const entree = valider(schemas.marquerVisite.pick({ visiteId: true }).extend({ actes: schemas.creerVisite.shape.actes }), {
      visiteId,
      actes,
    });
    await corrigerActesVisite(soignanteId, entree.visiteId, entree.actes);
    return null;
  });
  revalidateTournee();
  return resultat;
}

/** Reporte une visite prévue à demain (même tranche) en un geste. */
export async function decalerVisiteAction(visiteId: string) {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(() => decalerVisiteAuLendemain(soignanteId, valider(uuid, visiteId)));
  revalidateTournee();
  return resultat;
}

export async function historiqueVisiteAction(visiteId: string) {
  const soignanteId = await requireSoignanteId();
  return lireHistoriqueVisite(soignanteId, valider(uuid, visiteId));
}

// ---------------------------------------------------------------------------
// Transferts
// ---------------------------------------------------------------------------

/** Demande à une collègue de reprendre un patient, une visite ou une série. */
export async function creerTransfertAction(input: {
  cible: CibleTransfert;
  versSoignanteId: string;
  message?: string | null;
}): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  const resultat = await enResultat(async () => {
    const entree = valider(schemas.transfert, input);
    await creerTransfert(soignanteId, entree);
    // Prévient la destinataire (texte fixe, sans donnée médicale) ; n'échoue jamais.
    await notifier(soignanteId, "transfert", { cibles: [entree.versSoignanteId] });
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
  const resultat = await enResultat(() =>
    repondreTransfert(soignanteId, valider(uuid, transfertId), valider(schemas.decisionTransfert, decision))
  );
  revalidateTournee();
  revalidatePath("/alertes");
  revalidatePath("/patients", "layout");
  return resultat;
}

export async function marquerReponseVueAction(transfertId: string) {
  const soignanteId = await requireSoignanteId();
  await marquerReponseVue(soignanteId, valider(uuid, transfertId));
  revalidatePath("/alertes");
}

// ---------------------------------------------------------------------------
// Patients : recherche, planning
// ---------------------------------------------------------------------------

export type PatientRecherche = {
  id: string;
  prenom: string;
  nom: string;
  secteurNom: string | null;
};

/** Échappe les caractères joker de LIKE : une recherche « % » ne doit pas lister toute la base. */
function motifLike(texte: string): string {
  return `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function rechercherPatientsAction(query: string): Promise<PatientRecherche[]> {
  const soignanteId = await requireSoignanteId();
  const q = valider(schemas.rechercheTexte, typeof query === "string" ? query : "").trim();
  if (q.length < 2) return [];

  return withSoignante(soignanteId, async (tx) => {
    const motif = motifLike(q);
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
            ilike(patients.nom, motif),
            ilike(patients.prenom, motif),
            ilike(sql`${patients.prenom} || ' ' || ${patients.nom}`, motif)
          )
        )
      )
      .limit(10);

    return rows;
  });
}

/** Copie toutes les visites d'un jour vers un autre (statut remis à "prevue"). Ignore les doublons déjà présents et les visites annulées. */
export async function dupliquerJourAction(
  sourceDate: string,
  targetDate: string
): Promise<Resultat<{ copiees: number }>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const { source: jourSource, cible: jourCible } = valider(schemas.duplicationJour, {
      source: sourceDate,
      cible: targetDate,
    });
    return withSoignante(soignanteId, async (tx) => {
      const source = await tx
        .select()
        .from(visites)
        .where(and(eq(visites.date, jourSource), ne(visites.statut, "annulee")));
      if (source.length === 0) return { copiees: 0 };

      let copiees = 0;
      const rows = source.map((v) => ({
        patientId: v.patientId,
        soignanteId: v.soignanteId,
        date: jourCible,
        tranche: v.tranche,
        ordreDansPassage: v.ordreDansPassage,
        actes: v.actes,
        dureeEstimeeMin: v.dureeEstimeeMin,
        statut: "prevue" as const,
      }));
      for (let i = 0; i < rows.length; i += 400) {
        const inserted = await tx
          .insert(visites)
          .values(rows.slice(i, i + 400))
          .onConflictDoNothing()
          .returning({ id: visites.id });
        copiees += inserted.length;
      }
      return { copiees };
    });
  });

  revalidateTournee();
  return resultat;
}

/** Duplique une semaine complète (lundi -> dimanche) vers la semaine suivante (+7 jours). */
export async function genererSemaineSuivanteAction(
  mondayIso: string
): Promise<Resultat<{ copiees: number }>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const lundi = valider(schemas.duplicationJour.shape.source, mondayIso);
    const dimanche = ajouterJours(lundi, 6);

    return withSoignante(soignanteId, async (tx) => {
      const source = await tx
        .select()
        .from(visites)
        .where(
          and(gte(visites.date, lundi), lte(visites.date, dimanche), ne(visites.statut, "annulee"))
        );
      if (source.length === 0) return { copiees: 0 };

      const rows = source.map((v) => ({
        patientId: v.patientId,
        soignanteId: v.soignanteId,
        date: ajouterJours(v.date, 7),
        tranche: v.tranche,
        ordreDansPassage: v.ordreDansPassage,
        actes: v.actes,
        dureeEstimeeMin: v.dureeEstimeeMin,
        statut: "prevue" as const,
      }));

      let copiees = 0;
      for (let i = 0; i < rows.length; i += 400) {
        const inserted = await tx
          .insert(visites)
          .values(rows.slice(i, i + 400))
          .onConflictDoNothing()
          .returning({ id: visites.id });
        copiees += inserted.length;
      }
      return { copiees };
    });
  });

  revalidateTournee();
  return resultat;
}

// ---------------------------------------------------------------------------
// Fiche patient : accès domicile, transmissions, documents
// ---------------------------------------------------------------------------

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

export async function updatePatientAccessAction(input: {
  patientId: string;
  patch: AccessPatch;
}): Promise<Resultat<PatientAccess>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const patientId = valider(uuid, input?.patientId);
    const patch = valider(schemas.accesPatch, input?.patch ?? {});
    // Valeurs sensibles chiffrées (AES-256-GCM) avant d'atteindre la base.
    const chiffre = chiffrerPatchAcces(patientId, patch);

    const row = await withSoignante(soignanteId, async (tx) => {
      const [saved] = await tx
        .insert(accesDomicile)
        .values({ patientId, updatedBy: soignanteId, ...chiffre })
        .onConflictDoUpdate({
          target: accesDomicile.patientId,
          set: { ...chiffre, updatedAt: new Date(), updatedBy: soignanteId },
        })
        .returning();
      await auditer(tx, {
        action: "acces_domicile_modifie",
        entite: "acces_domicile",
        entiteId: saved.id,
        patientId,
      });
      return saved;
    });

    revalidatePath(`/patients/${patientId}`);
    return lireAcces(row, patientId);
  });
  return resultat;
}

export async function addTransmissionAction(input: {
  patientId: string;
  contenu: string;
  importance: "info" | "attention" | "urgent";
}): Promise<Resultat<PatientTransmission>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const entree = valider(schemas.transmission, input);

    const transmission = await withSoignante(soignanteId, async (tx) => {
      const [created] = await tx
        .insert(transmissions)
        .values({
          patientId: entree.patientId,
          soignanteId,
          contenu: entree.contenu,
          importance: entree.importance,
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

    revalidatePath(`/patients/${entree.patientId}`);
    revalidatePath("/alertes");

    // Transmission urgente : toute l'équipe active (sauf l'auteure) est prévenue, sans le contenu.
    if (entree.importance === "urgent") {
      await notifier(soignanteId, "urgence", { exclureExpediteur: true });
    }

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
  });
  return resultat;
}

export async function markTransmissionReadAction(
  transmissionId: string
): Promise<{ transmissionId: string }> {
  const soignanteId = await requireSoignanteId();
  const id = valider(uuid, transmissionId);

  const patientId = await withSoignante(soignanteId, async (tx) => {
    const rows = await tx
      .select({
        patientId: transmissions.patientId,
        luePar: transmissions.luePar,
      })
      .from(transmissions)
      .where(eq(transmissions.id, id))
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
        .where(eq(transmissions.id, id));
    }

    return row.patientId;
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/alertes");

  return { transmissionId: id };
}

export async function uploadPatientDocumentAction(
  formData: FormData
): Promise<Resultat<PatientDocument>> {
  const soignanteId = await requireSoignanteId();

  return enResultat(async () => {
    const patientId = valider(uuid, String(formData.get("patientId") ?? ""));
    const legende = valider(schemas.legendeDocument, String(formData.get("legende") ?? ""));
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ErreurMetier("Aucun fichier reçu.");

    // Type réel contrôlé par signature, métadonnées (GPS…) retirées, nom d'objet généré ici.
    const { cle, type } = await enregistrerFichier(soignanteId, patientId, "documents", file);

    const created = await withSoignante(soignanteId, async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          patientId,
          soignanteId,
          type: type.image ? "photo" : "document",
          fichierKey: cle,
          legende,
        })
        .returning();
      await auditer(tx, {
        action: "document_ajoute",
        entite: "document",
        entiteId: row.id,
        patientId,
      });
      return row;
    });

    revalidatePath(`/patients/${patientId}`);

    return {
      id: created.id,
      type: created.type,
      legende: created.legende,
      createdAt: created.createdAt.toISOString(),
      signedUrl: await getSignedDownloadUrl(created.fichierKey),
      filename: created.fichierKey.split("/").pop() ?? created.fichierKey,
      isImage: type.image,
    };
  });
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
): Promise<Resultat<{ id: string }>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const entree = valider(schemas.patient, input);

    return withSoignante(soignanteId, async (tx) => {
      const [created] = await tx
        .insert(patients)
        .values({ ...entree, createdBy: soignanteId })
        .returning({ id: patients.id });
      await auditer(tx, { action: "patient_cree", entite: "patient", entiteId: created.id, patientId: created.id });
      return created;
    });
  });

  revalidatePath("/patients");
  return resultat;
}

export async function modifierPatientAction(
  patientId: string,
  input: CreatePatientInput
): Promise<Resultat<{ id: string }>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const id = valider(uuid, patientId);
    const entree = valider(schemas.patient, input);

    return withSoignante(soignanteId, async (tx) => {
      const [maj] = await tx
        .update(patients)
        .set(entree)
        .where(eq(patients.id, id))
        .returning({ id: patients.id });
      if (!maj) throw new ErreurMetier("Patient introuvable.");
      await auditer(tx, { action: "patient_modifie", entite: "patient", entiteId: id, patientId: id });
      return maj;
    });
  });

  revalidatePath("/patients");
  revalidatePath(`/patients/${patientId}`);
  return resultat;
}

export async function creerSecteurAction(nom: string): Promise<Resultat<SecteurOption>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const nomValide = valider(schemas.secteur, nom);

    return withSoignante(soignanteId, async (tx) => {
      const existing = await tx
        .select({ couleur: secteurs.couleur, ordre: secteurs.ordre })
        .from(secteurs);

      const ordreMax = existing.reduce((max, s) => Math.max(max, s.ordre), 0);

      const [row] = await tx
        .insert(secteurs)
        .values({
          nom: nomValide,
          ordre: ordreMax + 1,
          couleur: prochaineCouleurSecteur(existing.map((s) => s.couleur)),
        })
        .returning();

      return row;
    });
  });

  revalidatePath("/patients");
  revalidatePath("/patients/nouveau");
  return resultat;
}

// ---------------------------------------------------------------------------
// Comptes et mots de passe
// ---------------------------------------------------------------------------

export async function createRemplacanteAction(input: {
  role?: "titulaire" | "remplacante";
  prenom: string;
  nom: string;
  email: string;
  remplaceId: string | null;
  dateDebut: string;
  dateFin: string | null;
}): Promise<Resultat<{ email: string; password: string }>> {
  const soignanteId = await requireAdminId();
  const resultat = await enResultat(async () => {
    const entree = valider(schemas.creerCompte, input);
    const cree = await createRemplacanteForSoignante(soignanteId, entree);
    await auditerSeul(soignanteId, { action: "compte_cree", entite: "soignante", entiteId: cree.id });
    return { email: cree.email, password: cree.password };
  });
  revalidatePath("/compte");
  revalidatePath("/compte/nouvelle-remplacante");
  return resultat;
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
}): Promise<Resultat<null>> {
  const soignanteId = await requireAdminId();
  const resultat = await enResultat(async () => {
    const entree = valider(schemas.modifierCompte, input);
    await updateRemplacanteForSoignante(soignanteId, entree);
    await auditerSeul(soignanteId, { action: "compte_modifie", entite: "soignante", entiteId: entree.id });
    return null;
  });
  revalidatePath("/compte");
  if (typeof input?.id === "string") revalidatePath(`/compte/remplacantes/${input.id}`);
  return resultat;
}

/** Donne ou retire les droits d'administration (le dernier admin ne peut pas être retiré : trigger en base). */
export async function definirAdminAction(soignanteCibleId: string, estAdmin: boolean): Promise<Resultat<null>> {
  const soignanteId = await requireAdminId();
  const resultat = await enResultat(async () => {
    const cible = valider(uuid, soignanteCibleId);
    if (typeof estAdmin !== "boolean") throw new ErreurMetier("Valeur invalide.");
    try {
      await withSoignante(soignanteId, async (tx) => {
        const modifiees = await tx
          .update(soignantes)
          .set({ estAdmin })
          .where(and(eq(soignantes.id, cible), eq(soignantes.role, "titulaire")))
          .returning({ id: soignantes.id });
        if (modifiees.length === 0) {
          throw new ErreurMetier("Seule une titulaire peut être administratrice.");
        }
        await auditer(tx, { action: "droits_admin_modifies", entite: "soignante", entiteId: cible });
      });
    } catch (e) {
      // Garde-fou du trigger : « dernier administrateur ».
      if (e instanceof ErreurMetier) throw e;
      const message = e instanceof Error ? `${e.message} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}` : "";
      if (message.includes("dernier administrateur")) {
        throw new ErreurMetier("Impossible de retirer le dernier administrateur.");
      }
      throw e;
    }
    return null;
  });
  revalidatePath("/compte");
  return resultat;
}

function motDePasseTemporaire(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Mot de passe oublié : l'admin génère un mot de passe temporaire, affiché une
 * seule fois. Il remplace l'ancien, déconnecte la soignante de tous ses appareils
 * et doit être changé dès la prochaine connexion (aucune autre page avant).
 */
export async function reinitialiserMotDePasseAction(
  soignanteCibleId: string
): Promise<Resultat<{ email: string; motDePasse: string }>> {
  const soignanteId = await requireAdminId();
  return enResultat(async () => {
    const cible = valider(uuid, soignanteCibleId);
    const motDePasse = motDePasseTemporaire();
    const passwordHash = await hashPassword(motDePasse);

    const email = await withSoignante(soignanteId, async (tx) => {
      const [row] = await tx
        .update(soignantes)
        .set({
          passwordHash,
          mustChangePassword: true,
          sessionVersion: sql`${soignantes.sessionVersion} + 1`,
        })
        .where(eq(soignantes.id, cible))
        .returning({ email: soignantes.email });
      if (!row) throw new ErreurMetier("Compte introuvable.");
      await auditer(tx, { action: "mot_de_passe_reinitialise", entite: "soignante", entiteId: cible });
      return row.email;
    });

    return { email, motDePasse };
  });
}

/** « Se déconnecter partout » : invalide toutes les sessions de la soignante, y compris celle-ci. */
export async function deconnecterPartoutAction(): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();
  return enResultat(async () => {
    await withSoignante(soignanteId, async (tx) => {
      await tx
        .update(soignantes)
        .set({ sessionVersion: sql`${soignantes.sessionVersion} + 1` })
        .where(eq(soignantes.id, soignanteId));
      await auditer(tx, { action: "deconnexion_globale", entite: "soignante", entiteId: soignanteId });
    });
    return null;
  });
}

export async function changerMotDePasseAction(
  motDePasseActuel: string,
  nouveauMotDePasse: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Autorisé même avec un mot de passe temporaire (c'est précisément son rôle).
  const current = await getCurrentSoignante({ autoriserMotDePasseTemporaire: true });
  const soignanteId = current.id;

  const resultat = await enResultat(async () => {
    const entree = valider(schemas.motsDePasse, { actuel: motDePasseActuel, nouveau: nouveauMotDePasse });
    if (entree.nouveau === entree.actuel) {
      throw new ErreurMetier("Choisis un mot de passe différent de l'actuel.");
    }

    const compte = await authLookupSoignante(current.email);
    if (!compte || !(await verifyPassword(compte.passwordHash, entree.actuel))) {
      throw new ErreurMetier("Le mot de passe actuel est incorrect.");
    }

    const passwordHash = await hashPassword(entree.nouveau);
    await withSoignante(soignanteId, async (tx) => {
      await tx
        .update(soignantes)
        .set({
          passwordHash,
          mustChangePassword: false,
          // Les autres appareils (et celui-ci) doivent se reconnecter.
          sessionVersion: sql`${soignantes.sessionVersion} + 1`,
        })
        .where(eq(soignantes.id, soignanteId));
      await auditer(tx, { action: "mot_de_passe_change", entite: "soignante", entiteId: soignanteId });
    });
    return null;
  });

  return resultat.ok ? { ok: true } : { ok: false, error: resultat.error };
}

// ---------------------------------------------------------------------------
// Ordonnances et traitements
// ---------------------------------------------------------------------------

export async function creerOrdonnanceAction(formData: FormData): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();

  const resultat = await enResultat(async () => {
    const entree = valider(schemas.ordonnance, {
      patientId: String(formData.get("patientId") ?? ""),
      prescripteur: String(formData.get("prescripteur") ?? ""),
      description: String(formData.get("description") ?? ""),
      datePrescription: String(formData.get("datePrescription") ?? ""),
      dateFin: String(formData.get("dateFin") ?? ""),
    });

    const file = formData.get("file");
    let fichierKey: string | null = null;
    if (file instanceof File && file.size > 0) {
      fichierKey = (await enregistrerFichier(soignanteId, entree.patientId, "ordonnances", file)).cle;
    }

    if (!entree.prescripteur && !entree.description && !fichierKey && !entree.dateFin) {
      throw new ErreurMetier("Renseigne au moins le prescripteur, une description, une date de fin ou un fichier.");
    }

    await withSoignante(soignanteId, async (tx) => {
      const [row] = await tx
        .insert(ordonnances)
        .values({
          patientId: entree.patientId,
          prescripteur: entree.prescripteur,
          description: entree.description,
          datePrescription: entree.datePrescription,
          dateDebut: entree.datePrescription,
          dateFin: entree.dateFin,
          fichierKey,
          createdBy: soignanteId,
        })
        .returning({ id: ordonnances.id });
      await auditer(tx, {
        action: "ordonnance_ajoutee",
        entite: "ordonnance",
        entiteId: row.id,
        patientId: entree.patientId,
      });
    });

    revalidatePath(`/patients/${entree.patientId}`);
    revalidatePath("/alertes");
    return null;
  });
  return resultat;
}

export async function archiverOrdonnanceAction(ordonnanceId: string, patientId: string) {
  const soignanteId = await requireSoignanteId();
  const ordonnance = valider(uuid, ordonnanceId);
  const patient = valider(uuid, patientId);
  await withSoignante(soignanteId, async (tx) => {
    await tx
      .update(ordonnances)
      .set({ active: false })
      .where(and(eq(ordonnances.id, ordonnance), eq(ordonnances.patientId, patient)));
    await auditer(tx, {
      action: "ordonnance_archivee",
      entite: "ordonnance",
      entiteId: ordonnance,
      patientId: patient,
    });
  });
  revalidatePath(`/patients/${patient}`);
  revalidatePath("/alertes");
}

export async function creerTraitementAction(input: {
  patientId: string;
  libelle: string;
  dosage: string;
  passages: string[];
  notes: string;
}): Promise<Resultat<null>> {
  const soignanteId = await requireSoignanteId();

  return enResultat(async () => {
    const entree = valider(schemas.traitement, input);
    await withSoignante(soignanteId, (tx) => tx.insert(traitements).values(entree));
    revalidatePath(`/patients/${entree.patientId}`);
    return null;
  });
}

export async function arreterTraitementAction(traitementId: string, patientId: string) {
  const soignanteId = await requireSoignanteId();
  const traitement = valider(uuid, traitementId);
  const patient = valider(uuid, patientId);
  await withSoignante(soignanteId, (tx) =>
    tx
      .update(traitements)
      .set({ actif: false })
      .where(and(eq(traitements.id, traitement), eq(traitements.patientId, patient)))
  );
  revalidatePath(`/patients/${patient}`);
}
