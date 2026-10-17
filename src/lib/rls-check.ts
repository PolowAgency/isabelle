// Vérifie que le rôle Postgres de l'application ne contourne pas la RLS.
// Sans dépendance à Next : utilisable au démarrage du serveur et par le script
// `npm run check:rls`.

export type VerificationRole = {
  ok: boolean;
  /** Messages génériques, sans nom de rôle ni information de connexion. */
  problemes: string[];
};

type Requete = (
  texte: string
) => Promise<{ rolsuper: boolean; rolbypassrls: boolean }[] | undefined>;

export async function verifierRoleBase(requete: Requete): Promise<VerificationRole> {
  const rows = await requete(
    "select rolsuper, rolbypassrls from pg_roles where rolname = current_user"
  );
  const role = rows?.[0];
  if (!role) return { ok: false, problemes: ["rôle de connexion introuvable"] };

  const problemes: string[] = [];
  if (role.rolsuper) problemes.push("le rôle de connexion est superutilisateur");
  if (role.rolbypassrls) problemes.push("le rôle de connexion a l'attribut BYPASSRLS");
  return { ok: problemes.length === 0, problemes };
}

export const MESSAGE_ROLE_NON_CONFORME =
  "Configuration de la base de données non conforme : le rôle utilisé contourne la sécurité par ligne (RLS). " +
  "Utiliser un rôle restreint (scripts/create-app-role.sql) — voir README, « Rôle Postgres de l'application ».";
