import "server-only";

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { lireAcces } from "@/lib/acces";
import { todayISO } from "@/lib/date";
import { getDemoInstantane, orDemo } from "@/lib/demo-data";
import { accesDomicile, patients, soignantes, traitements, transmissions, visites } from "@/lib/schema";
import { getTourneeVisites, ordreTranche } from "@/lib/tournee";
import type { FicheHL, InstantaneHL, VisiteHL } from "./types";

/**
 * Données téléchargées sur l'appareil pour le mode hors-ligne — volontairement
 * limitées (minimisation) : uniquement les visites DU JOUR de la soignante et les
 * fiches de CES patients ; ni photos ni documents ni ordonnances (fichiers) ; les 5
 * dernières transmissions seulement. Le navigateur les chiffre avant de les stocker
 * et les purge à la déconnexion (voir src/lib/offline/stockage.ts).
 */
function versVisiteHL(v: Awaited<ReturnType<typeof getTourneeVisites>>[number]): VisiteHL {
  return {
    id: v.id,
    patientId: v.patientId,
    patientPrenom: v.patientPrenom,
    patientNom: v.patientNom,
    adresse: v.adresse,
    ville: v.ville,
    secteurNom: v.secteurNom ?? "Sans secteur",
    tranche: v.tranche,
    actes: v.actes,
    statut: v.statut,
    heureReelle: v.heureReelle ? new Date(v.heureReelle).toISOString() : null,
    heureArrivee: v.heureArrivee ? new Date(v.heureArrivee).toISOString() : null,
    traitementsDus: v.traitementsDus ?? [],
    prises: v.prises ?? [],
    serieId: v.serieId,
  };
}

export async function construireInstantane(soignanteId: string): Promise<InstantaneHL> {
  // Mode démo sans base : instantané fictif (au jour figé des données de démonstration).
  const sansBase = await orDemo(
    async () => {
      await withSoignante(soignanteId, (tx) => tx.execute(sql`select 1`));
      return false;
    },
    () => true
  );
  if (sansBase) {
    const demo = getDemoInstantane(soignanteId);
    const visitesDemo = (await getTourneeVisites(soignanteId, demo.jour, "jour", "mine")).map(versVisiteHL);
    return { soignanteId, jour: demo.jour, genereLe: Date.now(), visites: visitesDemo, fiches: demo.fiches };
  }

  const jour = todayISO();
  const lignes = await getTourneeVisites(soignanteId, jour, "jour", "mine");
  const visitesHL = lignes.map(versVisiteHL);
  const patientIds = Array.from(new Set(visitesHL.map((v) => v.patientId)));
  const fiches = await construireFiches(soignanteId, patientIds, jour);

  return { soignanteId, jour, genereLe: Date.now(), visites: visitesHL, fiches };
}

async function construireFiches(
  soignanteId: string,
  patientIds: string[],
  jour: string
): Promise<Record<string, FicheHL>> {
  if (patientIds.length === 0) return {};

  return withSoignante(soignanteId, async (tx) => {
    const [fichesRows, accesRows, traitementRows, transmissionRows, prochainesRows] = await Promise.all([
      tx.select().from(patients).where(inArray(patients.id, patientIds)),
      tx.select().from(accesDomicile).where(inArray(accesDomicile.patientId, patientIds)),
      tx
        .select()
        .from(traitements)
        .where(and(inArray(traitements.patientId, patientIds), eq(traitements.actif, true)))
        .orderBy(asc(traitements.libelle)),
      tx
        .select({
          patientId: transmissions.patientId,
          contenu: transmissions.contenu,
          importance: transmissions.importance,
          createdAt: transmissions.createdAt,
          auteur: soignantes.prenom,
        })
        .from(transmissions)
        .innerJoin(soignantes, eq(soignantes.id, transmissions.soignanteId))
        .where(inArray(transmissions.patientId, patientIds))
        .orderBy(desc(transmissions.createdAt))
        .limit(patientIds.length * 5 + 50),
      tx
        .select({
          patientId: visites.patientId,
          date: visites.date,
          tranche: visites.tranche,
          actes: visites.actes,
        })
        .from(visites)
        .where(
          and(
            inArray(visites.patientId, patientIds),
            eq(visites.statut, "prevue"),
            gte(visites.date, jour)
          )
        )
        .orderBy(asc(visites.date), asc(ordreTranche(visites.tranche)))
        .limit(patientIds.length * 3 + 50),
    ]);

    // Chaque fiche téléchargée est une consultation : tracée comme à l'écran.
    for (const patientId of patientIds) {
      await auditer(tx, {
        action: "patient_consulte",
        entite: "patient",
        entiteId: patientId,
        patientId,
        dedoublonnerMinutes: 10,
      });
    }
    await auditer(tx, { action: "donnees_hors_ligne_telechargees", entite: "hors_ligne", dedoublonnerMinutes: 5 });

    const resultat: Record<string, FicheHL> = {};
    for (const p of fichesRows) {
      const ligneAcces = accesRows.find((a) => a.patientId === p.id);
      const acces = lireAcces(ligneAcces, p.id);
      if (ligneAcces) {
        await auditer(tx, {
          action: "acces_domicile_consulte",
          entite: "acces_domicile",
          entiteId: ligneAcces.id,
          patientId: p.id,
          dedoublonnerMinutes: 10,
        });
      }
      resultat[p.id] = {
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
          codePortail: acces.codePortail,
          codeImmeuble: acces.codeImmeuble,
          etage: acces.etage,
          digicodePorte: acces.digicodePorte,
          emplacementCle: acces.emplacementCle,
          presenceAnimal: acces.presenceAnimal,
          descriptionAnimal: acces.descriptionAnimal,
          detailsAidant: acces.detailsAidant,
          stationnement: acces.stationnement,
          notesAcces: acces.notesAcces,
        },
        traitements: traitementRows
          .filter((t) => t.patientId === p.id)
          .map((t) => ({ libelle: t.libelle, dosage: t.dosage, passages: t.passages })),
        transmissions: transmissionRows
          .filter((t) => t.patientId === p.id)
          .slice(0, 5)
          .map((t) => ({
            contenu: t.contenu,
            importance: t.importance,
            createdAt: t.createdAt.toISOString(),
            auteur: t.auteur,
          })),
        prochaines: prochainesRows
          .filter((v) => v.patientId === p.id)
          .slice(0, 3)
          .map((v) => ({ date: v.date, tranche: v.tranche, actes: v.actes })),
      };
    }
    return resultat;
  });
}
