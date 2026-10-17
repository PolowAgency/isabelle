-- Isabelle — Tournée — Lot 0 : administrateur explicite, sessions révocables,
-- mot de passe temporaire, jour courant à Paris dans la RLS.

-- 1. Colonnes ---------------------------------------------------------------

alter table soignantes
  add column est_admin boolean not null default false,
  -- Incrémentée pour déconnecter une soignante de tous ses appareils.
  add column session_version int not null default 0,
  -- Mot de passe temporaire : changement obligatoire à la prochaine connexion.
  add column must_change_password boolean not null default false;

-- Reprise de l'ancienne règle codée en dur (titulaire prénommée « Isabelle »
-- ou email du cabinet de test), une fois pour toutes : ensuite seule la colonne compte.
update soignantes
set est_admin = true
where role = 'titulaire'
  and (lower(email) = 'isabelle@cabinet-test.local' or lower(btrim(prenom)) = 'isabelle');

do $$
begin
  if not exists (select 1 from soignantes where est_admin) then
    raise notice 'Aucun administrateur après migration : en désigner un (voir README, « Administrateurs »).';
  end if;
end $$;

-- 2. Helpers RLS -------------------------------------------------------------

-- Jour courant à Paris (et non à l'heure du serveur Postgres, UTC en général) :
-- la date de fin d'une remplaçante doit expirer à minuit heure de Paris.
create or replace function app_is_active_soignante()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from soignantes s
    where s.id = app_current_soignante_id()
      and s.actif = true
      and (s.date_fin is null or s.date_fin >= (now() at time zone 'Europe/Paris')::date)
  );
$$;

create function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from soignantes s
    where s.id = app_current_soignante_id()
      and s.actif = true
      and s.est_admin = true
      and (s.date_fin is null or s.date_fin >= (now() at time zone 'Europe/Paris')::date)
  );
$$;

-- 3. Garde-fous sur est_admin ------------------------------------------------
-- En plus des contrôles de l'application : seul un administrateur peut changer
-- ce champ, et on ne peut pas retirer ni désactiver le dernier administrateur.

create function soignantes_garde_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Création d'un admin : réservée aux admins (sauf tout premier compte, au bootstrap).
    if new.est_admin and exists (select 1 from soignantes where est_admin) and not app_is_admin() then
      raise exception 'Seul un administrateur peut créer un administrateur.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.est_admin is distinct from old.est_admin and not app_is_admin() then
    raise exception 'Seul un administrateur peut modifier les droits d''administration.' using errcode = '42501';
  end if;

  if old.est_admin and old.actif and (not new.est_admin or not new.actif)
     and not exists (
       select 1 from soignantes s
       where s.est_admin and s.actif and s.id <> old.id
     ) then
    raise exception 'Impossible de retirer ou désactiver le dernier administrateur.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger soignantes_garde_admin_insert
  before insert on soignantes
  for each row execute function soignantes_garde_admin();

create trigger soignantes_garde_admin_update
  before update of est_admin, actif on soignantes
  for each row execute function soignantes_garde_admin();

-- 4. Policies soignantes plus strictes ------------------------------------------
-- Création et modification d'un compte : un admin, ou la soignante elle-même
-- (changement de mot de passe, « se déconnecter partout »).

drop policy soignantes_all_active on soignantes;
drop policy soignantes_update_active on soignantes;

create policy soignantes_insert_admin on soignantes
  for insert with check (app_is_admin());

create policy soignantes_update_self_or_admin on soignantes
  for update
  using (app_is_active_soignante() and (id = app_current_soignante_id() or app_is_admin()))
  with check (app_is_active_soignante() and (id = app_current_soignante_id() or app_is_admin()));

-- 5. Connexion : colonnes supplémentaires ---------------------------------------

drop function auth_lookup_soignante(text);

create function auth_lookup_soignante(p_email text)
returns table (
  id uuid,
  prenom text,
  nom text,
  email text,
  password_hash text,
  couleur text,
  role text,
  actif boolean,
  date_fin date,
  est_admin boolean,
  session_version int,
  must_change_password boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.prenom, s.nom, s.email, s.password_hash, s.couleur, s.role, s.actif, s.date_fin,
         s.est_admin, s.session_version, s.must_change_password
  from soignantes s
  where lower(s.email) = lower(p_email)
  limit 1;
$$;

revoke all on function auth_lookup_soignante(text) from public;
