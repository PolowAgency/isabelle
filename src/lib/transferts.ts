import "server-only";

import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withSoignante } from "@/lib/db";
import { getDemoTransferts, orDemo } from "@/lib/demo-data";
import { todayISO } from "@/lib/date";
import { ErreurMetier } from "@/lib/resultat";
import { journaliser, type Tx } from "@/lib/visites";
import {
  patients,
  seriesVisites,
  soignantes,
  transferts,
  visites,
  type StatutTransfert,
} from "@/lib/schema";

export type CibleTransfert = { type: "patient" | "visite" | "serie"; id: string };

export type TransfertLigne = {
  id: string;
  statut: StatutTransfert;
  message: string | null;
  createdAt: string;
  traiteAt: string | null;
  cible: CibleTransfert["type"];
  patientId: string;
  patientPrenom: string;
  patientNom: string;
  visiteDate: string | null;
  visiteTranche: string | null;
  serieDebut: string | null;
  serieFin: string | null;
  deId: string;
  dePrenom: string;
  deNom: string;
  versId: string;
  versPrenom: string;
  versNom: string;
};

export type TransfertsPourAlertes = {
  /** Demandes qui m'attendent : accepter / refuser. */
  recus: TransfertLigne[];
  /** Réponses à mes demandes, pas encore lues. */
  reponses: TransfertLigne[];
  /** Mes demandes encore sans réponse. */
  envoyes: TransfertLigne[];
};

/** Visites que le transfert déplace : celles de l'émettrice, à venir, encore « prevue ». */
function conditionVisites(
  t: { patientId: string | null; visiteId: string | null; serieId: string | null; deSoignanteId: string }
): SQL | undefined {
  const base = [eq(visites.soignanteId, t.deSoignanteId), eq(visites.statut, "prevue")];
  if (t.visiteId) return and(...base, eq(visites.id, t.visiteId));
  const aVenir = gte(visites.date, todayISO());
  if (t.serieId) return and(...base, aVenir, eq(visites.serieId, t.serieId));
  if (t.patientId) return and(...base, aVenir, eq(visites.patientId, t.patientId));
  return undefined;
}

export async function creerTransfert(
  soignanteId: string,
  input: { cible: CibleTransfert; versSoignanteId: string; message?: string | null }
): Promise<void> {
  if (input.versSoignanteId === soignanteId) {
    throw new ErreurMetier("Choisissez une autre soignante.");
  }
  const message = input.message?.trim().slice(0, 500) || null;
  const cibleIds = {
    patientId: input.cible.type === "patient" ? input.cible.id : null,
    visiteId: input.cible.type === "visite" ? input.cible.id : null,
    serieId: input.cible.type === "serie" ? input.cible.id : null,
  };

  await orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [vers] = await tx
          .select({ id: soignantes.id, dateFin: soignantes.dateFin })
          .from(soignantes)
          .where(and(eq(soignantes.id, input.versSoignanteId), eq(soignantes.actif, true)))
          .limit(1);
        if (!vers || (vers.dateFin && vers.dateFin < todayISO())) {
          throw new ErreurMetier("Destinataire introuvable ou inactive.");
        }

        const aTransferer = await tx
          .select({ id: visites.id })
          .from(visites)
          .where(conditionVisites({ ...cibleIds, deSoignanteId: soignanteId }))
          .limit(1);
        if (aTransferer.length === 0) {
          throw new ErreurMetier("Aucune visite à venir à transférer (à votre nom).");
        }

        const [cree] = await tx
          .insert(transferts)
          .values({
            ...cibleIds,
            deSoignanteId: soignanteId,
            versSoignanteId: input.versSoignanteId,
            message,
          })
          .onConflictDoNothing()
          .returning({ id: transferts.id });
        if (!cree) {
          throw new ErreurMetier("Une demande identique est déjà en attente pour cette collègue.");
        }
      }),
    () => undefined
  );
}

async function nomsSoignantes(tx: Tx, ids: string[]) {
  const rows = await tx
    .select({ id: soignantes.id, prenom: soignantes.prenom, nom: soignantes.nom })
    .from(soignantes)
    .where(inArray(soignantes.id, ids));
  return new Map(rows.map((r) => [r.id, `${r.prenom} ${r.nom}`]));
}

/**
 * Accepte ou refuse une demande. Seule la destinataire peut répondre, une seule
 * fois (la mise à jour conditionnelle sert de verrou). À l'acceptation, les
 * visites futures « prevue » de l'émettrice passent à la destinataire.
 */
export async function repondreTransfert(
  soignanteId: string,
  transfertId: string,
  decision: "accepte" | "refuse"
): Promise<{ deplacees: number }> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const [t] = await tx
          .update(transferts)
          .set({ statut: decision, traiteAt: new Date(), reponseVue: false })
          .where(
            and(
              eq(transferts.id, transfertId),
              eq(transferts.versSoignanteId, soignanteId),
              eq(transferts.statut, "en_attente")
            )
          )
          .returning();
        if (!t) {
          throw new ErreurMetier("Cette demande n'existe plus ou ne vous est pas adressée.");
        }
        if (decision === "refuse") return { deplacees: 0 };

        const condition = conditionVisites(t);
        const deplacees = await tx
          .update(visites)
          .set({ soignanteId: t.versSoignanteId })
          .where(condition)
          .returning({ id: visites.id });

        if (t.serieId) {
          await tx
            .update(seriesVisites)
            .set({ soignanteId: t.versSoignanteId })
            .where(eq(seriesVisites.id, t.serieId));
        }

        const noms = await nomsSoignantes(tx, [t.deSoignanteId, t.versSoignanteId]);
        await journaliser(
          tx,
          soignanteId,
          deplacees.map(({ id }) => ({
            visiteId: id,
            champ: "soignante" as const,
            ancienne: noms.get(t.deSoignanteId) ?? null,
            nouvelle: noms.get(t.versSoignanteId) ?? null,
          }))
        );
        return { deplacees: deplacees.length };
      }),
    () => ({ deplacees: 0 })
  );
}

export async function marquerReponseVue(soignanteId: string, transfertId: string): Promise<void> {
  await orDemo(
    () =>
      withSoignante(soignanteId, (tx) =>
        tx
          .update(transferts)
          .set({ reponseVue: true })
          .where(
            and(
              eq(transferts.id, transfertId),
              eq(transferts.deSoignanteId, soignanteId),
              inArray(transferts.statut, ["accepte", "refuse"])
            )
          )
      ),
    () => undefined
  );
}

export async function listerTransferts(soignanteId: string): Promise<TransfertsPourAlertes> {
  return orDemo(
    () =>
      withSoignante(soignanteId, async (tx) => {
        const de = alias(soignantes, "de");
        const vers = alias(soignantes, "vers");

        const rows = await tx
          .select({
            id: transferts.id,
            statut: transferts.statut,
            message: transferts.message,
            createdAt: transferts.createdAt,
            traiteAt: transferts.traiteAt,
            patientDirect: transferts.patientId,
            visiteId: transferts.visiteId,
            serieId: transferts.serieId,
            patientId: patients.id,
            patientPrenom: patients.prenom,
            patientNom: patients.nom,
            visiteDate: visites.date,
            visiteTranche: visites.tranche,
            serieDebut: seriesVisites.dateDebut,
            serieFin: seriesVisites.dateFin,
            deId: de.id,
            dePrenom: de.prenom,
            deNom: de.nom,
            versId: vers.id,
            versPrenom: vers.prenom,
            versNom: vers.nom,
          })
          .from(transferts)
          .leftJoin(visites, eq(visites.id, transferts.visiteId))
          .leftJoin(seriesVisites, eq(seriesVisites.id, transferts.serieId))
          .innerJoin(
            patients,
            sql`${patients.id} = coalesce(${transferts.patientId}, ${visites.patientId}, ${seriesVisites.patientId})`
          )
          .innerJoin(de, eq(de.id, transferts.deSoignanteId))
          .innerJoin(vers, eq(vers.id, transferts.versSoignanteId))
          .where(
            or(
              and(eq(transferts.versSoignanteId, soignanteId), eq(transferts.statut, "en_attente")),
              and(
                eq(transferts.deSoignanteId, soignanteId),
                or(eq(transferts.statut, "en_attente"), eq(transferts.reponseVue, false))
              )
            )
          )
          .orderBy(desc(transferts.createdAt), asc(patients.nom));

        const lignes: TransfertLigne[] = rows.map((r) => ({
          id: r.id,
          statut: r.statut,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          traiteAt: r.traiteAt ? r.traiteAt.toISOString() : null,
          cible: r.visiteId ? "visite" : r.serieId ? "serie" : "patient",
          patientId: r.patientId,
          patientPrenom: r.patientPrenom,
          patientNom: r.patientNom,
          visiteDate: r.visiteDate,
          visiteTranche: r.visiteTranche,
          serieDebut: r.serieDebut,
          serieFin: r.serieFin,
          deId: r.deId,
          dePrenom: r.dePrenom,
          deNom: r.deNom,
          versId: r.versId,
          versPrenom: r.versPrenom,
          versNom: r.versNom,
        }));

        return {
          recus: lignes.filter((l) => l.versId === soignanteId && l.statut === "en_attente"),
          reponses: lignes.filter((l) => l.deId === soignanteId && l.statut !== "en_attente"),
          envoyes: lignes.filter((l) => l.deId === soignanteId && l.statut === "en_attente"),
        };
      }),
    () => getDemoTransferts(soignanteId)
  );
}
