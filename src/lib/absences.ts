import "server-only";

import { and, asc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { withSoignante } from "@/lib/db";
import { auditer } from "@/lib/audit";
import { orDemo } from "@/lib/demo-data";
import { ajouterJours, todayISO } from "@/lib/date";
import { conditionVisites } from "@/lib/transferts";
import { ErreurMetier } from "@/lib/resultat";
import { absences, patients, soignantes, transferts, visites } from "@/lib/schema";
import type { Tx } from "@/lib/visites";

export type AbsenceLigne = {
  id: string;
  soignanteId: string;
  soignantePrenom: string;
  soignanteNom: string;
  soignanteCouleur: string;
  dateDebut: string;
  dateFin: string;
  motif: string | null;
  /** Visites encore « prévues » de cette soignante pendant l'absence (à répartir). */
  aRepartir: number;
};


/** Absences en cours ou à venir de toute l'équipe, avec le nombre de visites encore à répartir. */
export async function listerAbsences(soignanteId: string): Promise<AbsenceLigne[]> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const aujourdhui = todayISO();
        const rows = await tx
          .select({
            id: absences.id,
            soignanteId: absences.soignanteId,
            soignantePrenom: soignantes.prenom,
            soignanteNom: soignantes.nom,
            soignanteCouleur: soignantes.couleur,
            dateDebut: absences.dateDebut,
            dateFin: absences.dateFin,
            motif: absences.motif,
            aRepartir: sql<number>`(
              select count(*)::int from visites v
              where v.soignante_id = ${absences.soignanteId}
                and v.statut = 'prevue'
                and v.date between greatest(${absences.dateDebut}, ${aujourdhui}::date) and ${absences.dateFin}
            )`,
          })
          .from(absences)
          .innerJoin(soignantes, eq(soignantes.id, absences.soignanteId))
          .where(gte(absences.dateFin, aujourdhui))
          .orderBy(asc(absences.dateDebut), asc(soignantes.prenom));
        return rows as AbsenceLigne[];
      }),
    () => []
  );
}

/** Absences qui touchent la période [debut, fin] (pour la vue Semaine). */
export async function absencesSurPeriode(
  soignanteId: string,
  debut: string,
  fin: string
): Promise<{ id: string; soignanteId: string; soignantePrenom: string; soignanteCouleur: string; dateDebut: string; dateFin: string; motif: string | null }[]> {
  return orDemo(
    () =>
      withSoignante(soignanteId, (tx) =>
        tx
          .select({
            id: absences.id,
            soignanteId: absences.soignanteId,
            soignantePrenom: soignantes.prenom,
            soignanteCouleur: soignantes.couleur,
            dateDebut: absences.dateDebut,
            dateFin: absences.dateFin,
            motif: absences.motif,
          })
          .from(absences)
          .innerJoin(soignantes, eq(soignantes.id, absences.soignanteId))
          .where(and(lte(absences.dateDebut, fin), gte(absences.dateFin, debut)))
          .orderBy(asc(absences.dateDebut))
      ),
    () => []
  );
}

export async function creerAbsence(
  soignanteId: string,
  admin: boolean,
  input: { soignanteId: string; dateDebut: string; dateFin: string; motif: string | null }
): Promise<{ id: string }> {
  if (input.soignanteId !== soignanteId && !admin) {
    throw new ErreurMetier("Vous ne pouvez déclarer que vos propres absences.");
  }
  if (input.dateFin < input.dateDebut) throw new ErreurMetier("La date de fin précède la date de début.");
  if (input.dateFin < todayISO()) throw new ErreurMetier("Cette période est déjà passée.");
  if (input.dateFin > ajouterJours(input.dateDebut, 366)) throw new ErreurMetier("Une absence ne peut pas dépasser un an.");

  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [cible] = await tx
          .select({ id: soignantes.id })
          .from(soignantes)
          .where(and(eq(soignantes.id, input.soignanteId), eq(soignantes.actif, true)))
          .limit(1);
        if (!cible) throw new ErreurMetier("Soignante introuvable ou inactive.");

        const [chevauche] = await tx
          .select({ id: absences.id })
          .from(absences)
          .where(
            and(
              eq(absences.soignanteId, input.soignanteId),
              lte(absences.dateDebut, input.dateFin),
              gte(absences.dateFin, input.dateDebut)
            )
          )
          .limit(1);
        if (chevauche) throw new ErreurMetier("Une absence est déjà déclarée sur une partie de cette période.");

        const [cree] = await tx
          .insert(absences)
          .values({ ...input, createdBy: soignanteId })
          .returning({ id: absences.id });
        await auditer(tx, { action: "absence_declaree", entite: "absence", entiteId: cree.id });
        return cree;
      }),
    () => ({ id: "demo" })
  );
}

export async function supprimerAbsence(soignanteId: string, absenceId: string): Promise<void> {
  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        // La RLS limite déjà aux absences de la soignante (ou à toutes pour un administrateur).
        const supprimee = await tx.delete(absences).where(eq(absences.id, absenceId)).returning({ id: absences.id });
        if (supprimee.length === 0) throw new ErreurMetier("Absence introuvable.");
        await auditer(tx, { action: "absence_supprimee", entite: "absence", entiteId: absenceId });
      }),
    () => undefined
  );
}

// --- Répartition -----------------------------------------------------------------

export type VisiteARepartir = {
  id: string;
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  date: string;
  tranche: string;
  actes: string[];
  dureeEstimeeMin: number | null;
};

export type CollegueRepartition = {
  id: string;
  prenom: string;
  nom: string;
  couleur: string;
  /** Visites déjà prévues de cette collègue sur la période. */
  visites: { date: string; tranche: string; actes: string[]; dureeEstimeeMin: number | null }[];
  joursAbsente: string[];
};

export type DonneesRepartition = {
  absence: { id: string; soignanteId: string; soignantePrenom: string; dateDebut: string; dateFin: string; motif: string | null };
  /** Période réellement à répartir (le passé n'est pas concerné). */
  periode: { debut: string; fin: string };
  visites: VisiteARepartir[];
  collegues: CollegueRepartition[];
};

async function absenceAutorisee(tx: Tx, soignanteId: string, admin: boolean, absenceId: string) {
  const [absence] = await tx
    .select({
      id: absences.id,
      soignanteId: absences.soignanteId,
      soignantePrenom: soignantes.prenom,
      dateDebut: absences.dateDebut,
      dateFin: absences.dateFin,
      motif: absences.motif,
    })
    .from(absences)
    .innerJoin(soignantes, eq(soignantes.id, absences.soignanteId))
    .where(eq(absences.id, absenceId))
    .limit(1);
  if (!absence) throw new ErreurMetier("Absence introuvable.");
  if (absence.soignanteId !== soignanteId && !admin) {
    throw new ErreurMetier("Seule la personne absente (ou un administrateur) peut répartir ses visites.");
  }
  return absence;
}

/** Visites à répartir et charge de chaque collègue sur la période de l'absence. */
export async function lireDonneesRepartition(
  soignanteId: string,
  admin: boolean,
  absenceId: string
): Promise<DonneesRepartition> {
  return withSoignante(soignanteId, async (tx) => {
    const absence = await absenceAutorisee(tx, soignanteId, admin, absenceId);
    const aujourdhui = todayISO();
    const debut = absence.dateDebut > aujourdhui ? absence.dateDebut : aujourdhui;
    const fin = absence.dateFin;

    const aRepartir = await tx
      .select({
        id: visites.id,
        patientId: visites.patientId,
        patientPrenom: patients.prenom,
        patientNom: patients.nom,
        date: visites.date,
        tranche: visites.tranche,
        actes: visites.actes,
        dureeEstimeeMin: visites.dureeEstimeeMin,
      })
      .from(visites)
      .innerJoin(patients, eq(patients.id, visites.patientId))
      .where(
        and(
          eq(visites.soignanteId, absence.soignanteId),
          eq(visites.statut, "prevue"),
          gte(visites.date, debut),
          lte(visites.date, fin)
        )
      )
      .orderBy(asc(patients.nom), asc(visites.date));

    const equipe = await tx
      .select({ id: soignantes.id, prenom: soignantes.prenom, nom: soignantes.nom, couleur: soignantes.couleur })
      .from(soignantes)
      .where(
        and(
          eq(soignantes.actif, true),
          ne(soignantes.id, absence.soignanteId),
          or(sql`${soignantes.dateFin} is null`, gte(soignantes.dateFin, debut))
        )
      )
      .orderBy(asc(soignantes.prenom));
    const ids = equipe.map((c) => c.id);

    const [deLaPeriode, absencesCollegues] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            tx
              .select({
                soignanteId: visites.soignanteId,
                date: visites.date,
                tranche: visites.tranche,
                actes: visites.actes,
                dureeEstimeeMin: visites.dureeEstimeeMin,
              })
              .from(visites)
              .where(
                and(
                  inArray(visites.soignanteId, ids),
                  eq(visites.statut, "prevue"),
                  gte(visites.date, debut),
                  lte(visites.date, fin)
                )
              ),
            tx
              .select({ soignanteId: absences.soignanteId, dateDebut: absences.dateDebut, dateFin: absences.dateFin })
              .from(absences)
              .where(and(inArray(absences.soignanteId, ids), lte(absences.dateDebut, fin), gte(absences.dateFin, debut))),
          ]);

    const collegues: CollegueRepartition[] = equipe.map((c) => {
      const jours = new Set<string>();
      for (const a of absencesCollegues.filter((x) => x.soignanteId === c.id)) {
        for (let j = a.dateDebut > debut ? a.dateDebut : debut; j <= (a.dateFin < fin ? a.dateFin : fin); j = ajouterJours(j, 1)) {
          jours.add(j);
        }
      }
      return {
        ...c,
        visites: deLaPeriode
          .filter((v) => v.soignanteId === c.id)
          .map(({ date, tranche, actes, dureeEstimeeMin }) => ({ date, tranche, actes, dureeEstimeeMin })),
        joursAbsente: Array.from(jours).sort(),
      };
    });

    return {
      absence,
      periode: { debut, fin },
      visites: aRepartir,
      collegues,
    };
  });
}

/**
 * Crée une demande de transfert par patient, bornée à la période de l'absence, au nom de la personne absente.
 * La destinataire accepte ou refuse (individuellement ou en lot) ; rien ne bouge avant son accord.
 */
export async function creerTransfertsAbsence(
  soignanteId: string,
  admin: boolean,
  input: { absenceId: string; affectations: { patientId: string; versSoignanteId: string }[]; message: string | null }
): Promise<{ crees: number; ignores: number; destinataires: string[] }> {
  return withSoignante(soignanteId, async (tx) => {
    const absence = await absenceAutorisee(tx, soignanteId, admin, input.absenceId);
    const aujourdhui = todayISO();
    const debut = absence.dateDebut > aujourdhui ? absence.dateDebut : aujourdhui;
    const fin = absence.dateFin;
    const message = input.message?.trim().slice(0, 500) || null;

    const destinataires = Array.from(new Set(input.affectations.map((a) => a.versSoignanteId)));
    if (destinataires.includes(absence.soignanteId)) throw new ErreurMetier("Choisissez une autre soignante.");
    const valides = await tx
      .select({ id: soignantes.id, dateFin: soignantes.dateFin })
      .from(soignantes)
      .where(and(inArray(soignantes.id, destinataires), eq(soignantes.actif, true)));
    if (valides.length !== destinataires.length || valides.some((v) => v.dateFin && v.dateFin < aujourdhui)) {
      throw new ErreurMetier("Destinataire introuvable ou inactive.");
    }

    let crees = 0;
    let ignores = 0;
    for (const a of input.affectations) {
      const [aTransferer] = await tx
        .select({ id: visites.id })
        .from(visites)
        .where(
          conditionVisites({
            patientId: a.patientId,
            visiteId: null,
            serieId: null,
            deSoignanteId: absence.soignanteId,
            periodeDebut: debut,
            periodeFin: fin,
          })
        )
        .limit(1);
      if (!aTransferer) {
        ignores += 1;
        continue;
      }
      const [cree] = await tx
        .insert(transferts)
        .values({
          patientId: a.patientId,
          deSoignanteId: absence.soignanteId,
          versSoignanteId: a.versSoignanteId,
          message,
          absenceId: absence.id,
          periodeDebut: debut,
          periodeFin: fin,
        })
        .onConflictDoNothing()
        .returning({ id: transferts.id });
      if (cree) crees += 1;
      else ignores += 1;
    }
    if (crees > 0) await auditer(tx, { action: "absence_repartie", entite: "absence", entiteId: absence.id });
    return { crees, ignores, destinataires };
  });
}
