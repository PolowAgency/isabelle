import "server-only";

import { hashPassword } from "@/lib/password";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { prochaineCouleur } from "@/lib/couleurs";
import { ajouterMois, todayISO } from "@/lib/date";
import { ErreurMetier } from "@/lib/resultat";
import { randomBytes } from "crypto";
import { withSoignante, soignantePublicColumns } from "@/lib/db";
import {
  getDemoEquipe,
  getDemoMonthlyFigures,
  getDemoRemplacanteById,
  getDemoTeamWorkload,
  getDemoTitulairesActives,
  isDemoModeEnabled,
  isOfflineDbError,
} from "@/lib/demo-data";
import { patients, soignantes, visites } from "@/lib/schema";
import type { PublicSoignante } from "@/lib/schema";

export type CreateRemplacanteInput = {
  role?: "titulaire" | "remplacante";
  prenom: string;
  nom: string;
  email: string;
  remplaceId: string | null;
  dateDebut: string;
  dateFin: string | null;
};

export type UpdateRemplacanteInput = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  remplaceId: string | null;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
};

export type MonthlyFigures = {
  visitesPlanifiees: number;
  visitesFaites: number;
  visitesAbsentes: number;
  visitesReportees: number;
  patientsActifs: number;
  remplacantesActives: number;
};

export type TeamWorkload = {
  soignanteId: string;
  prenom: string;
  nom: string;
  couleur: string;
  role: "titulaire" | "remplacante";
  planifiées: number;
  faites: number;
  absentes: number;
  reportees: number;
};

function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

/** Bornes du mois en cours à Paris : [début, début du mois suivant[. */
function bornesDuMois() {
  const debut = `${todayISO().slice(0, 8)}01`;
  return { monthStart: debut, nextMonthStart: ajouterMois(debut, 1) };
}

/**
 * Administrateur = colonne `soignantes.est_admin` (jamais déduite d'un prénom ou
 * d'un email). Les droits ne se modifient que par `definirAdminAction`, doublée
 * côté base par un trigger (migrations/0008_admin_session.sql).
 */
export function isAdmin(soignante: Pick<PublicSoignante, "estAdmin">): boolean {
  return soignante.estAdmin === true;
}

export async function getEquipe(soignanteId: string): Promise<PublicSoignante[]> {
  try {
    return await withSoignante(soignanteId, (tx) =>
      tx
        .select(soignantePublicColumns)
        .from(soignantes)
        .orderBy(asc(soignantes.role), asc(soignantes.nom), asc(soignantes.prenom))
    );
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoEquipe();
    }
    throw error;
  }
}

export async function getTitulairesActives(soignanteId: string): Promise<PublicSoignante[]> {
  try {
    return await withSoignante(soignanteId, (tx) =>
      tx
        .select(soignantePublicColumns)
        .from(soignantes)
        .where(and(eq(soignantes.role, "titulaire"), eq(soignantes.actif, true)))
        .orderBy(asc(soignantes.nom), asc(soignantes.prenom))
    );
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoTitulairesActives();
    }
    throw error;
  }
}

export async function getMonthlyFigures(soignanteId: string): Promise<MonthlyFigures> {
  const { monthStart, nextMonthStart } = bornesDuMois();

  try {
    return await withSoignante(soignanteId, async (tx) => {
      const [planned, done, absent, postponed, activePatients, activeRemplacantes] =
        await Promise.all([
          tx
            .select({ count: visites.id })
            .from(visites)
            .where(and(gte(visites.date, monthStart), lt(visites.date, nextMonthStart))),
          tx
            .select({ count: visites.id })
            .from(visites)
            .where(
              and(
                gte(visites.date, monthStart),
                lt(visites.date, nextMonthStart),
                eq(visites.statut, "faite")
              )
            ),
          tx
            .select({ count: visites.id })
            .from(visites)
            .where(
              and(
                gte(visites.date, monthStart),
                lt(visites.date, nextMonthStart),
                eq(visites.statut, "absent")
              )
            ),
          tx
            .select({ count: visites.id })
            .from(visites)
            .where(
              and(
                gte(visites.date, monthStart),
                lt(visites.date, nextMonthStart),
                eq(visites.statut, "reportee")
              )
            ),
          tx
            .select({ count: patients.id })
            .from(patients)
            .where(eq(patients.actif, true)),
          tx
            .select({ count: soignantes.id })
            .from(soignantes)
            .where(and(eq(soignantes.role, "remplacante"), eq(soignantes.actif, true))),
        ]);

      return {
        visitesPlanifiees: planned.length,
        visitesFaites: done.length,
        visitesAbsentes: absent.length,
        visitesReportees: postponed.length,
        patientsActifs: activePatients.length,
        remplacantesActives: activeRemplacantes.length,
      };
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoMonthlyFigures();
    }
    throw error;
  }
}

export async function getRemplacanteById(
  soignanteId: string,
  remplacanteId: string
): Promise<PublicSoignante | null> {
  try {
    const rows = await withSoignante(soignanteId, (tx) =>
      tx
        .select(soignantePublicColumns)
        .from(soignantes)
        .where(and(eq(soignantes.id, remplacanteId), eq(soignantes.role, "remplacante")))
        .limit(1)
    );

    return rows[0] ?? null;
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoRemplacanteById(remplacanteId);
    }
    throw error;
  }
}

export async function getTeamWorkload(soignanteId: string): Promise<TeamWorkload[]> {
  const { monthStart, nextMonthStart } = bornesDuMois();

  try {
    return await withSoignante(soignanteId, async (tx) => {
      const rows = await tx
        .select({
          soignanteId: soignantes.id,
          prenom: soignantes.prenom,
          nom: soignantes.nom,
          couleur: soignantes.couleur,
          role: soignantes.role,
          visiteId: visites.id,
          statut: visites.statut,
        })
        .from(soignantes)
        .leftJoin(
          visites,
          and(
            eq(visites.soignanteId, soignantes.id),
            gte(visites.date, monthStart),
            lt(visites.date, nextMonthStart)
          )
        )
        .where(eq(soignantes.actif, true))
        .orderBy(asc(soignantes.role), asc(soignantes.nom), asc(soignantes.prenom));

      const map = new Map<string, TeamWorkload>();

      for (const row of rows) {
        if (!map.has(row.soignanteId)) {
          map.set(row.soignanteId, {
            soignanteId: row.soignanteId,
            prenom: row.prenom,
            nom: row.nom,
            couleur: row.couleur,
            role: row.role,
            planifiées: 0,
            faites: 0,
            absentes: 0,
            reportees: 0,
          });
        }

        const item = map.get(row.soignanteId)!;
        if (row.visiteId) {
          item.planifiées += 1;
          if (row.statut === "faite") item.faites += 1;
          if (row.statut === "absent") item.absentes += 1;
          if (row.statut === "reportee") item.reportees += 1;
        }
      }

      return Array.from(map.values());
    });
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      return getDemoTeamWorkload();
    }
    throw error;
  }
}

export async function createRemplacanteForSoignante(
  callerId: string,
  input: CreateRemplacanteInput
): Promise<{ id: string; email: string; password: string }> {
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();
  const email = input.email.trim().toLowerCase();

  if (!prenom || !nom || !email || !input.dateDebut) {
    throw new Error("Prénom, nom, email et date de début sont obligatoires.");
  }

  const role = input.role === "titulaire" ? "titulaire" : "remplacante";
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const id = await withSoignante(callerId, async (tx) => {
    const equipe = await tx
      .select({ couleur: soignantes.couleur })
      .from(soignantes)
      .where(eq(soignantes.actif, true));

    const existing = await tx
      .select({ id: soignantes.id })
      .from(soignantes)
      .where(eq(soignantes.email, email))
      .limit(1);

    if (existing[0]) {
      throw new ErreurMetier("Une soignante existe déjà avec cet email.");
    }

    const [cree] = await tx
      .insert(soignantes)
      .values({
      prenom,
      nom,
      email,
      passwordHash,
      // Mot de passe provisoire : à changer dès la première connexion.
      mustChangePassword: true,
      couleur: prochaineCouleur(equipe.map((item) => item.couleur)),
      role,
      actif: true,
      remplaceId: role === "remplacante" ? input.remplaceId : null,
      dateDebut: input.dateDebut,
      dateFin: role === "remplacante" ? input.dateFin : null,
    })
      .returning({ id: soignantes.id });
    return cree.id;
  });

  return { id, email, password };
}

export async function updateRemplacanteForSoignante(
  callerId: string,
  input: UpdateRemplacanteInput
): Promise<void> {
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();
  const email = input.email.trim().toLowerCase();

  if (!prenom || !nom || !email || !input.dateDebut) {
    throw new Error("Prénom, nom, email et date de début sont obligatoires.");
  }

  await withSoignante(callerId, async (tx) => {
    const existing = await tx
      .select({ id: soignantes.id })
      .from(soignantes)
      .where(eq(soignantes.email, email))
      .limit(10);

    const collision = existing.find((row) => row.id !== input.id);
    if (collision) {
      throw new ErreurMetier("Une autre soignante utilise déjà cet email.");
    }

    await tx
      .update(soignantes)
      .set({
        prenom,
        nom,
        email,
        actif: input.actif,
        remplaceId: input.remplaceId,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin,
      })
      .where(and(eq(soignantes.id, input.id), eq(soignantes.role, "remplacante")));
  });
}
