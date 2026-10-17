import "server-only";

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { getDemoVisiteActes, orDemo } from "@/lib/demo-data";
import { MESSAGE_ACTE_REQUIS, nettoyerActes } from "@/lib/actes";
import { ajouterJours } from "@/lib/recurrence";
import { deplacerDansListe, type Sens } from "@/lib/ordre";
import { ErreurMetier } from "@/lib/resultat";
import type { StatutVisite } from "@/lib/tournee";
import { soignantes, visites, visitesHistorique, type ChampHistorique } from "@/lib/schema";

export type Tx = Parameters<Parameters<typeof withSoignante>[1]>[0];

export type EntreeHistorique = {
  visiteId: string;
  champ: ChampHistorique;
  ancienne: string | null;
  nouvelle: string | null;
};

export const texteActes = (actes: string[]) => (actes.length > 0 ? actes.join(", ") : null);

/**
 * Trace les modifications d'une visite (qui, quand, quel champ, avant / après).
 * Les valeurs vont en base uniquement — jamais dans les logs applicatifs.
 * Les entrées sans changement réel sont ignorées.
 */
export async function journaliser(tx: Tx, soignanteId: string, entrees: EntreeHistorique[]) {
  const lignes = entrees
    .filter((e) => e.ancienne !== e.nouvelle)
    .map((e) => ({
      visiteId: e.visiteId,
      soignanteId,
      champ: e.champ,
      ancienneValeur: e.ancienne,
      nouvelleValeur: e.nouvelle,
    }));
  for (let i = 0; i < lignes.length; i += 400) {
    await tx.insert(visitesHistorique).values(lignes.slice(i, i + 400));
  }
}

/**
 * Change le statut d'une visite. Une visite ne peut pas être validée
 * (« faite ») sans au moins un acte : si `actes` est fourni, ils sont
 * enregistrés dans la même transaction que la validation.
 */
/**
 * Cœur de changerStatutVisite, dans la transaction de l'appelant (utilisé aussi
 * par le rejeu des opérations hors-ligne, qui verrouille la ligne avant).
 */
export async function changerStatutDansTx(
  tx: Tx,
  soignanteId: string,
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<void> {
  const [visite] = await tx
    .select({
      statut: visites.statut,
      actes: visites.actes,
      heureReelle: visites.heureReelle,
    })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) throw new ErreurMetier("Visite introuvable.");
  if (visite.statut === "annulee") throw new ErreurMetier("Cette visite est annulée.");

  const actesFinaux = actes === undefined ? visite.actes : nettoyerActes(actes, visite.actes);
  if (statut === "faite" && actesFinaux.length === 0) {
    throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
  }

  await tx
    .update(visites)
    .set({
      statut,
      actes: actesFinaux,
      heureReelle: statut === "faite" ? (visite.heureReelle ?? new Date()) : null,
    })
    .where(eq(visites.id, visiteId));

  await journaliser(tx, soignanteId, [
    { visiteId, champ: "statut", ancienne: visite.statut, nouvelle: statut },
    { visiteId, champ: "actes", ancienne: texteActes(visite.actes), nouvelle: texteActes(actesFinaux) },
  ]);
}

/**
 * Change le statut d'une visite. Une visite ne peut pas être validée
 * (« faite ») sans au moins un acte : si `actes` est fourni, ils sont
 * enregistrés dans la même transaction que la validation.
 */
export async function changerStatutVisite(
  soignanteId: string,
  visiteId: string,
  statut: StatutVisite,
  actes?: string[]
): Promise<void> {
  await orDemo(
    () => withSoignante(soignanteId, (tx) => changerStatutDansTx(tx, soignanteId, visiteId, statut, actes)),
    () => {
      // Démo hors-ligne : aucune écriture, mais la règle « pas de validation sans acte » reste appliquée.
      const connus = actes === undefined ? getDemoVisiteActes(visiteId) : nettoyerActes(actes, getDemoVisiteActes(visiteId));
      if (statut === "faite" && connus.length === 0) throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
    }
  );
}

/** Corrige les actes d'un passage (y compris déjà validé : ajout d'un acte oublié). */
export async function corrigerActesVisite(
  soignanteId: string,
  visiteId: string,
  actes: string[]
): Promise<void> {
  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [visite] = await tx
          .select({ statut: visites.statut, actes: visites.actes })
          .from(visites)
          .where(eq(visites.id, visiteId))
          .limit(1);
        if (!visite) throw new ErreurMetier("Visite introuvable.");
        if (visite.statut === "annulee") throw new ErreurMetier("Cette visite est annulée.");
        const nouveaux = nettoyerActes(actes, visite.actes);
        if (visite.statut === "faite" && nouveaux.length === 0) {
          throw new ErreurMetier(MESSAGE_ACTE_REQUIS);
        }

        await tx
          .update(visites)
          .set({ actes: nouveaux, dureeEstimeeMin: nouveaux.length > 0 ? nouveaux.length * 15 : null })
          .where(eq(visites.id, visiteId));
        await journaliser(tx, soignanteId, [
          { visiteId, champ: "actes", ancienne: texteActes(visite.actes), nouvelle: texteActes(nouveaux) },
        ]);
      }),
    () => undefined
  );
}

/** Cœur du report à demain, dans la transaction de l'appelant. */
export async function decalerDansTx(
  tx: Tx,
  soignanteId: string,
  visiteId: string
): Promise<{ creee: boolean; date: string }> {
  // Le statut conditionnel fait office de verrou : deux appels simultanés
  // ne peuvent pas décaler la même visite deux fois.
  const [origine] = await tx
    .update(visites)
    .set({ statut: "reportee", heureReelle: null })
    .where(and(eq(visites.id, visiteId), eq(visites.statut, "prevue")))
    .returning();
  if (!origine) {
    throw new ErreurMetier("Cette visite n'est plus à faire : elle ne peut pas être décalée.");
  }

  const demain = ajouterJours(origine.date, 1);
  const [{ max }] = await tx
    .select({ max: sql<number>`coalesce(max(${visites.ordreDansPassage}), 0)` })
    .from(visites)
    .where(and(eq(visites.date, demain), eq(visites.passage, origine.passage)));

  const [creee] = await tx
    .insert(visites)
    .values({
      patientId: origine.patientId,
      soignanteId: origine.soignanteId,
      date: demain,
      tranche: origine.tranche,
      ordreDansPassage: Number(max) + 1,
      actes: origine.actes,
      dureeEstimeeMin: origine.dureeEstimeeMin,
      statut: "prevue",
      reportDeId: origine.id,
    })
    .onConflictDoNothing()
    .returning({ id: visites.id });

  await journaliser(tx, soignanteId, [
    { visiteId, champ: "statut", ancienne: "prevue", nouvelle: "reportee" },
    ...(creee
      ? [{ visiteId: creee.id, champ: "date" as const, ancienne: origine.date, nouvelle: demain }]
      : []),
  ]);

  return { creee: Boolean(creee), date: demain };
}

/**
 * Décale une visite prévue au lendemain en un geste : la visite passe en
 * « reportee » et une nouvelle visite « prevue » est créée demain, sur la même
 * tranche, avec les mêmes actes (modifiable ensuite). Pas de doublon : si le
 * patient a déjà une visite demain sur cette tranche, rien n'est créé ; et une
 * visite déjà reportée ne peut pas l'être une seconde fois.
 */
export async function decalerVisiteAuLendemain(
  soignanteId: string,
  visiteId: string
): Promise<{ creee: boolean; date: string }> {
  return orDemo(
    () => withSoignante(soignanteId, (tx) => decalerDansTx(tx, soignanteId, visiteId)),
    () => ({ creee: true, date: "" })
  );
}

export type EntreeHistoriqueLue = {
  id: string;
  createdAt: string;
  champ: ChampHistorique;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  soignantePrenom: string | null;
};

export async function lireHistoriqueVisite(
  soignanteId: string,
  visiteId: string
): Promise<EntreeHistoriqueLue[]> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const rows = await tx
          .select({
            id: visitesHistorique.id,
            createdAt: visitesHistorique.createdAt,
            champ: visitesHistorique.champ,
            ancienneValeur: visitesHistorique.ancienneValeur,
            nouvelleValeur: visitesHistorique.nouvelleValeur,
            soignantePrenom: soignantes.prenom,
          })
          .from(visitesHistorique)
          .leftJoin(soignantes, eq(soignantes.id, visitesHistorique.soignanteId))
          .where(eq(visitesHistorique.visiteId, visiteId))
          .orderBy(desc(visitesHistorique.createdAt))
          .limit(50);
        return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      }),
    () => []
  );
}

/**
 * Enregistre l'heure d'arrivée chez le patient. La première arrivée enregistrée
 * est conservée (rejouer l'action, ou une collègue arrivée entre-temps, ne la
 * modifie pas). `quand` vient de l'appareil (hors-ligne) : borné à « maintenant ».
 * Renvoie false si l'arrivée était déjà enregistrée.
 */
export async function marquerArriveeDansTx(tx: Tx, visiteId: string, quand: Date = new Date()): Promise<boolean> {
  const instant = quand.getTime() > Date.now() ? new Date() : quand;
  const [maj] = await tx
    .update(visites)
    .set({ heureArrivee: instant })
    .where(and(eq(visites.id, visiteId), ne(visites.statut, "annulee"), sql`${visites.heureArrivee} is null`))
    .returning({ id: visites.id });
  if (maj) return true;

  const [existante] = await tx.select({ statut: visites.statut }).from(visites).where(eq(visites.id, visiteId)).limit(1);
  if (!existante) throw new ErreurMetier("Visite introuvable.");
  if (existante.statut === "annulee") throw new ErreurMetier("Cette visite est annulée.");
  return false;
}

export async function marquerArrivee(soignanteId: string, visiteId: string): Promise<void> {
  await orDemo(
    () => withSoignante(soignanteId, (tx) => marquerArriveeDansTx(tx, visiteId)),
    () => undefined
  );
}

/**
 * Monte ou descend une visite d'un cran parmi celles de la même tranche, du même jour,
 * de la même soignante. Les visites déjà traitées gardent leur place. Les lignes du
 * groupe sont verrouillées : deux déplacements simultanés se suivent, sans doublon d'ordre.
 * Renvoie false si la visite est déjà en tête / en queue (rien à faire).
 */
export async function deplacerDansTx(tx: Tx, visiteId: string, sens: Sens): Promise<boolean> {
  const [visite] = await tx
    .select({
      date: visites.date,
      tranche: visites.tranche,
      soignanteId: visites.soignanteId,
      statut: visites.statut,
    })
    .from(visites)
    .where(eq(visites.id, visiteId))
    .limit(1);
  if (!visite) throw new ErreurMetier("Visite introuvable.");
  if (visite.statut !== "prevue") throw new ErreurMetier("Seules les visites à faire peuvent être déplacées.");

  const groupe = await tx
    .select({ id: visites.id, ordre: visites.ordreDansPassage, statut: visites.statut })
    .from(visites)
    .where(
      and(
        eq(visites.date, visite.date),
        eq(visites.tranche, visite.tranche),
        eq(visites.soignanteId, visite.soignanteId),
        ne(visites.statut, "annulee")
      )
    )
    .orderBy(asc(visites.ordreDansPassage), asc(visites.id))
    .for("update");

  const figes = new Set(groupe.filter((g) => g.statut !== "prevue").map((g) => g.id));
  const nouvelOrdre = deplacerDansListe(
    groupe.map((g) => g.id),
    visiteId,
    sens,
    figes
  );
  if (!nouvelOrdre) return false;

  const ancien = new Map(groupe.map((g) => [g.id, g.ordre]));
  for (let index = 0; index < nouvelOrdre.length; index++) {
    const id = nouvelOrdre[index];
    if (ancien.get(id) !== index + 1) {
      await tx.update(visites).set({ ordreDansPassage: index + 1 }).where(eq(visites.id, id));
    }
  }
  return true;
}

export async function deplacerVisite(soignanteId: string, visiteId: string, sens: Sens): Promise<boolean> {
  return orDemo(
    () => withSoignante(soignanteId, (tx) => deplacerDansTx(tx, visiteId, sens)),
    () => true
  );
}
