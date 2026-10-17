import "server-only";

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { orDemo } from "@/lib/demo-data";
import { ajouterJours, todayISO } from "@/lib/date";
import {
  COMMENTAIRE_PRISE_MAX,
  priseALerte,
  type PriseSaisie,
  type StatutPriseCalc,
  type TraitementDu,
} from "@/lib/prises-calc";
import { notifier } from "@/lib/push";
import { ErreurMetier } from "@/lib/resultat";
import { patients, prisesHistorique, prisesTraitement, soignantes, traitements, visites } from "@/lib/schema";
import type { Tx } from "@/lib/visites";

export const MESSAGE_PRISES_REQUISES =
  "Indiquez pour chaque traitement de ce passage s'il a été administré, refusé ou non administré.";

/** Traitements actifs du patient prévus au passage (matin / midi / soir) de cette visite. */
export async function traitementsDusDansTx(tx: Tx, visiteId: string): Promise<TraitementDu[]> {
  const [visite] = await tx
    .select({ patientId: visites.patientId, passage: visites.passage })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) return [];
  return tx
    .select({ id: traitements.id, libelle: traitements.libelle, dosage: traitements.dosage })
    .from(traitements)
    .where(
      and(
        eq(traitements.patientId, visite.patientId),
        eq(traitements.actif, true),
        sql`${visite.passage} = any(${traitements.passages})`
      )
    )
    .orderBy(asc(traitements.libelle));
}

export type PriseLue = {
  id: string;
  traitementId: string;
  statut: StatutPriseCalc;
  commentaire: string | null;
};

export async function lirePrisesDansTx(tx: Tx, visiteId: string): Promise<PriseLue[]> {
  return tx
    .select({
      id: prisesTraitement.id,
      traitementId: prisesTraitement.traitementId,
      statut: prisesTraitement.statut,
      commentaire: prisesTraitement.commentaire,
    })
    .from(prisesTraitement)
    .where(eq(prisesTraitement.visiteId, visiteId));
}

/**
 * Enregistre (ou corrige) les prises d'une visite. Une correction est tracée dans prises_historique
 * (qui, quand, avant / après) ; une prise redevenue « administrée » n'alerte plus, une prise
 * qui passe à « refusée » ou « non administrée » ré-alerte l'équipe. Renvoie true s'il y a une alerte à notifier.
 */
export async function enregistrerPrisesDansTx(
  tx: Tx,
  soignanteId: string,
  visiteId: string,
  saisies: readonly PriseSaisie[]
): Promise<{ alerte: boolean }> {
  if (saisies.length === 0) return { alerte: false };
  const [visite] = await tx
    .select({ patientId: visites.patientId })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) throw new ErreurMetier("Visite introuvable.");

  const existantes = new Map((await lirePrisesDansTx(tx, visiteId)).map((p) => [p.traitementId, p]));
  let alerte = false;

  for (const s of saisies) {
    const avant = existantes.get(s.traitementId);
    if (avant && avant.statut === s.statut && (avant.commentaire ?? null) === s.commentaire) continue;

    if (avant) {
      await tx
        .update(prisesTraitement)
        .set({
          statut: s.statut,
          commentaire: s.commentaire,
          soignanteId,
          updatedAt: new Date(),
          // Une nouvelle alerte repart à zéro ; une prise corrigée en « administrée » n'en a plus.
          alerteTraiteeAt: null,
          alerteTraiteePar: null,
        })
        .where(eq(prisesTraitement.id, avant.id));
      await tx.insert(prisesHistorique).values({
        priseId: avant.id,
        soignanteId,
        ancienStatut: avant.statut,
        nouveauStatut: s.statut,
        ancienCommentaire: avant.commentaire,
        nouveauCommentaire: s.commentaire,
      });
    } else {
      await tx.insert(prisesTraitement).values({
        visiteId,
        traitementId: s.traitementId,
        patientId: visite.patientId,
        statut: s.statut,
        commentaire: s.commentaire,
        soignanteId,
      });
    }
    if (priseALerte(s.statut)) alerte = true;
  }
  return { alerte };
}

/** Prévient l'équipe (texte fixe, sans donnée médicale) ; n'échoue jamais. */
export async function notifierPriseManquee(soignanteId: string): Promise<void> {
  await notifier(soignanteId, "traitement", { exclureExpediteur: true });
}

// --- Lecture --------------------------------------------------------------------

export type PriseAlerte = {
  id: string;
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  traitement: string;
  statut: StatutPriseCalc;
  commentaire: string | null;
  date: string;
  soignantePrenom: string | null;
};

const JOURS_ALERTE_PRISES = 14;

/** Prises refusées ou non administrées des 14 derniers jours, pas encore prises en compte. */
export async function listerAlertesPrises(soignanteId: string): Promise<PriseAlerte[]> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const depuis = ajouterJours(todayISO(), -JOURS_ALERTE_PRISES);
        const rows = await tx
          .select({
            id: prisesTraitement.id,
            patientId: patients.id,
            patientPrenom: patients.prenom,
            patientNom: patients.nom,
            traitement: traitements.libelle,
            statut: prisesTraitement.statut,
            commentaire: prisesTraitement.commentaire,
            date: visites.date,
            soignantePrenom: soignantes.prenom,
          })
          .from(prisesTraitement)
          .innerJoin(visites, eq(visites.id, prisesTraitement.visiteId))
          .innerJoin(patients, eq(patients.id, prisesTraitement.patientId))
          .innerJoin(traitements, eq(traitements.id, prisesTraitement.traitementId))
          .leftJoin(soignantes, eq(soignantes.id, prisesTraitement.soignanteId))
          .where(
            and(
              inArray(prisesTraitement.statut, ["refuse", "non_administre"]),
              sql`${prisesTraitement.alerteTraiteeAt} is null`,
              gte(visites.date, depuis)
            )
          )
          .orderBy(desc(visites.date), asc(patients.nom));
        return rows as PriseAlerte[];
      }),
    () => []
  );
}

/** « Pris en compte » : l'alerte disparaît pour toute l'équipe (la prise reste dans l'historique du patient). */
export async function marquerAlertePriseTraitee(soignanteId: string, priseId: string): Promise<void> {
  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const maj = await tx
          .update(prisesTraitement)
          .set({ alerteTraiteeAt: new Date(), alerteTraiteePar: soignanteId })
          .where(and(eq(prisesTraitement.id, priseId), sql`${prisesTraitement.alerteTraiteeAt} is null`))
          .returning({ id: prisesTraitement.id, patientId: prisesTraitement.patientId });
        if (maj.length === 0) throw new ErreurMetier("Cette alerte a déjà été prise en compte.");
        await auditer(tx, { action: "alerte_prise_traitee", entite: "patient", entiteId: maj[0].patientId, patientId: maj[0].patientId });
      }),
    () => undefined
  );
}

export type PriseHistorique = {
  id: string;
  visiteId: string;
  date: string;
  tranche: string;
  traitement: string;
  dosage: string | null;
  statut: StatutPriseCalc;
  commentaire: string | null;
  soignantePrenom: string | null;
  /** Nombre de corrections enregistrées depuis la saisie initiale. */
  corrections: number;
  alerteEnCours: boolean;
};

/** Historique des prises d'un patient (les plus récentes d'abord), dans la transaction de l'appelant. */
export async function lireHistoriquePrisesDansTx(tx: Tx, patientId: string, limite = 60): Promise<PriseHistorique[]> {
  const rows = await tx
    .select({
      id: prisesTraitement.id,
      visiteId: visites.id,
      date: visites.date,
      tranche: visites.tranche,
      traitement: traitements.libelle,
      dosage: traitements.dosage,
      statut: prisesTraitement.statut,
      commentaire: prisesTraitement.commentaire,
      soignantePrenom: soignantes.prenom,
      alerteTraiteeAt: prisesTraitement.alerteTraiteeAt,
      corrections: sql<number>`(select count(*)::int from prises_historique h where h.prise_id = ${prisesTraitement.id})`,
    })
    .from(prisesTraitement)
    .innerJoin(visites, eq(visites.id, prisesTraitement.visiteId))
    .innerJoin(traitements, eq(traitements.id, prisesTraitement.traitementId))
    .leftJoin(soignantes, eq(soignantes.id, prisesTraitement.soignanteId))
    .where(eq(prisesTraitement.patientId, patientId))
    .orderBy(desc(visites.date), desc(prisesTraitement.updatedAt))
    .limit(limite);
  return rows.map(({ alerteTraiteeAt, ...r }) => ({
    ...r,
    alerteEnCours: r.statut !== "administre" && alerteTraiteeAt === null,
  })) as PriseHistorique[];
}

/** Correction d'une prise depuis la fiche patient (tracée dans prises_historique). */
export async function corrigerPrise(
  soignanteId: string,
  priseId: string,
  statut: StatutPriseCalc,
  commentaire: string | null
): Promise<{ alerte: boolean }> {
  const note = commentaire?.trim().slice(0, COMMENTAIRE_PRISE_MAX) || null;
  const resultat = await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [prise] = await tx
          .select({ visiteId: prisesTraitement.visiteId, traitementId: prisesTraitement.traitementId, patientId: prisesTraitement.patientId })
          .from(prisesTraitement)
          .where(eq(prisesTraitement.id, priseId))
          .limit(1);
        if (!prise) throw new ErreurMetier("Prise introuvable.");
        const r = await enregistrerPrisesDansTx(tx, soignanteId, prise.visiteId, [
          { traitementId: prise.traitementId, statut, commentaire: statut === "administre" ? null : note },
        ]);
        await auditer(tx, { action: "prise_corrigee", entite: "patient", entiteId: prise.patientId, patientId: prise.patientId });
        return r;
      }),
    () => ({ alerte: false })
  );
  return resultat;
}

