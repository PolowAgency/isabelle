-- Isabelle — rôle Postgres de l'application (0.1)
--
-- L'application doit se connecter avec un rôle qui n'est NI superutilisateur
-- NI doté de BYPASSRLS, et qui n'est pas propriétaire des tables : sinon la RLS
-- (`app.current_soignante_id`) n'est pas appliquée et n'importe quelle fuite de
-- DATABASE_URL donne accès à toutes les données de santé. L'application refuse
-- d'ailleurs de démarrer en production avec un tel rôle (src/instrumentation.ts,
-- `npm run check:rls`).
--
-- À exécuter avec le rôle PROPRIÉTAIRE des tables (celui qui joue les migrations),
-- après chaque migration (le script est idempotent) :
--
--   psql "$DATABASE_URL_OWNER" -f scripts/create-app-role.sql
--   psql "$DATABASE_URL_OWNER" -c "alter role isabelle_app password '…mot de passe fort…'"
--
-- Puis DATABASE_URL = postgres://isabelle_app:…@hote:5432/base
-- Les migrations, la sauvegarde (pg_dump) et les scripts d'administration
-- utilisent le rôle propriétaire, jamais isabelle_app.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'isabelle_app') then
    create role isabelle_app login;
  end if;
end $$;

-- Un rôle créé par « create role » n'est ni superuser, ni BYPASSRLS, ni réplication.
-- (Aucun « alter role » : un propriétaire non-superuser, comme « postgres » sur
-- Supabase, n'a pas le droit de modifier les attributs d'un rôle.)
-- On vérifie seulement que c'est bien le cas :
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'isabelle_app' and (rolsuper or rolbypassrls)) then
    raise exception 'Le rôle isabelle_app contourne la sécurité par ligne (superuser ou BYPASSRLS) : le supprimer (drop owned by isabelle_app; drop role isabelle_app;) puis relancer.';
  end if;
end $$;

grant usage on schema public to isabelle_app;

grant select, insert, update, delete on all tables in schema public to isabelle_app;
grant usage, select on all sequences in schema public to isabelle_app;

-- Journal d'audit : ajout et lecture seulement (la RLS limite la lecture aux admins).
revoke update, delete, truncate on audit_log from isabelle_app;

-- Tentatives de connexion : uniquement via les fonctions security definer.
revoke all on login_attempts from isabelle_app;

-- Fonctions utilisées avant l'ouverture de session.
grant execute on function auth_lookup_soignante(text) to isabelle_app;
grant execute on function auth_login_etat(text, text) to isabelle_app;
grant execute on function auth_login_enregistrer(text, text, boolean, uuid, text) to isabelle_app;
grant execute on function audit_enregistrer(text, text, uuid, uuid, text, int) to isabelle_app;

-- Notifications push.
grant execute on function push_enregistrer(text, text, text, boolean, boolean) to isabelle_app;
grant execute on function push_destinataires(text, uuid[], uuid) to isabelle_app;
grant execute on function push_supprimer(uuid[]) to isabelle_app;
