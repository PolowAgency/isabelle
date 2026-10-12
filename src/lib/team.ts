import "server-only";

import { hashPassword } from "@/lib/password";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { prochaineCouleur } from "@/lib/couleurs";
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

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function toIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

// Identification par nom/email plutôt que par une colonne is_admin dédiée
// (limite connue, voir README). Restreint aux titulaires : sans cette
// condition, une remplaçante temporaire prénommée « Isabelle » hériterait
// par coïncidence des droits d'administration (création de comptes, chiffres
// de toute l'équipe).
export function isIsabelleAdmin(
  soignante: Pick<PublicSoignante, "email" | "prenom" | "role">
): boolean {
  if (soignante.role !== "titulaire") return false;
  return (
    soignante.email.toLowerCase() === "isabelle@cabinet-test.local" ||
    soignante.prenom.trim().toLowerCase() === "isabelle"
  );
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
  const monthStart = toIsoDate(startOfCurrentMonth());
  const nextMonthStart = toIsoDate(startOfNextMonth());

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
  const monthStart = toIsoDate(startOfCurrentMonth());
  const nextMonthStart = toIsoDate(startOfNextMonth());

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
): Promise<{ email: string; password: string }> {
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();
  const email = input.email.trim().toLowerCase();

  if (!prenom || !nom || !email || !input.dateDebut) {
    throw new Error("Prenom, nom, email et date de debut sont obligatoires.");
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  await withSoignante(callerId, async (tx) => {
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
      throw new Error("Une soignante existe deja avec cet email.");
    }

    await tx.insert(soignantes).values({
      prenom,
      nom,
      email,
      passwordHash,
      couleur: prochaineCouleur(equipe.map((item) => item.couleur)),
      role: "remplacante",
      actif: true,
      remplaceId: input.remplaceId,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
    });
  });

  return { email, password };
}

export async function updateRemplacanteForSoignante(
  callerId: string,
  input: UpdateRemplacanteInput
): Promise<void> {
  const prenom = input.prenom.trim();
  const nom = input.nom.trim();
  const email = input.email.trim().toLowerCase();

  if (!prenom || !nom || !email || !input.dateDebut) {
    throw new Error("Prenom, nom, email et date de debut sont obligatoires.");
  }

  await withSoignante(callerId, async (tx) => {
    const existing = await tx
      .select({ id: soignantes.id })
      .from(soignantes)
      .where(eq(soignantes.email, email))
      .limit(10);

    const collision = existing.find((row) => row.id !== input.id);
    if (collision) {
      throw new Error("Une autre soignante utilise deja cet email.");
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
