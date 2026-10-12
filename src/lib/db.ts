import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Connexion Postgres standard (DATABASE_URL) — aucune dépendance à
// supabase-js. Portable tel quel vers un Postgres HDS (Scaleway/OVHcloud).
//
// Le rôle Postgres utilisé par DATABASE_URL doit :
//   - ne pas être superutilisateur, ne pas avoir l'attribut BYPASSRLS
//     (sinon les policies RLS de migrations/0001_init.sql sont ignorées) ;
//   - avoir reçu GRANT EXECUTE sur auth_lookup_soignante (migrations/0002).
//

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const client = globalThis.__pgClient ?? postgres(process.env.DATABASE_URL!, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgClient = client;
}

const db = drizzle(client, { schema });

export type Db = typeof db;

/**
 * Accès direct, hors RLS applicative (connexion superuser en phase de
 * test — voir avertissement en tête de fichier). Réservé aux scripts
 * d'administration exécutés hors requête HTTP (bootstrap de comptes, seed).
 * Ne jamais importer depuis une route, un composant ou une Server Action.
 */
export const adminDb = db;

/**
 * Point d'entrée unique pour toute donnée liée à une soignante authentifiée.
 * Définit app.current_soignante_id pour la durée de la transaction : c'est
 * cette variable de session que les policies RLS vérifient. Toute lecture ou
 * écriture applicative doit passer par ici plutôt que par `db` directement.
 */
export async function withSoignante<T>(
  soignanteId: string,
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_soignante_id', ${soignanteId}, true)`);
    return fn(tx as unknown as Db);
  });
}

/** Colonnes de `soignantes` sûres à renvoyer au client (jamais passwordHash). */
export const soignantePublicColumns = {
  id: schema.soignantes.id,
  prenom: schema.soignantes.prenom,
  nom: schema.soignantes.nom,
  email: schema.soignantes.email,
  couleur: schema.soignantes.couleur,
  role: schema.soignantes.role,
  actif: schema.soignantes.actif,
  remplaceId: schema.soignantes.remplaceId,
  dateDebut: schema.soignantes.dateDebut,
  dateFin: schema.soignantes.dateFin,
  createdAt: schema.soignantes.createdAt,
} as const;

export type AuthLookupRow = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  passwordHash: string;
  couleur: string;
  role: "titulaire" | "remplacante";
  actif: boolean;
  dateFin: string | null;
};

/**
 * Seul point d'accès à `soignantes` hors contexte authentifié — utilisé par
 * le provider Credentials d'Auth.js pour vérifier email + mot de passe avant
 * qu'une session (et donc un app.current_soignante_id) n'existe. Passe par
 * la fonction Postgres security definer auth_lookup_soignante, qui ne
 * renvoie que les colonnes nécessaires à l'authentification.
 */
export async function authLookupSoignante(email: string): Promise<AuthLookupRow | null> {
  const rows = await client<
    {
      id: string;
      prenom: string;
      nom: string;
      email: string;
      password_hash: string;
      couleur: string;
      role: "titulaire" | "remplacante";
      actif: boolean;
      date_fin: string | null;
    }[]
  >`select * from auth_lookup_soignante(${email})`;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    prenom: row.prenom,
    nom: row.nom,
    email: row.email,
    passwordHash: row.password_hash,
    couleur: row.couleur,
    role: row.role,
    actif: row.actif,
    dateFin: row.date_fin,
  };
}
