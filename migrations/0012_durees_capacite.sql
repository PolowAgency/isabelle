-- Lot G : durées réelles.
--  * actes_durees : durée (minutes) d'un acte, modifiable par un administrateur. Les actes sans ligne
--    gardent la durée par défaut définie dans le code (src/lib/planning-calc.ts) ;
--  * reglages_planning : réglages d'équipe (capacité d'une tranche, en minutes).
-- RLS : lecture par toute soignante active, écriture réservée aux administrateurs.

create table if not exists actes_durees (
  acte        text primary key check (char_length(acte) between 1 and 60),
  duree_min   integer not null check (duree_min between 1 and 480),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references soignantes(id) on delete set null
);

create table if not exists reglages_planning (
  cle         text primary key check (cle in ('capacite_tranche_min')),
  valeur_int  integer not null check (valeur_int between 15 and 720),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references soignantes(id) on delete set null
);

alter table actes_durees enable row level security;
alter table reglages_planning enable row level security;

drop policy if exists actes_durees_lecture on actes_durees;
create policy actes_durees_lecture on actes_durees for select using (app_is_active_soignante());
drop policy if exists actes_durees_ecriture on actes_durees;
create policy actes_durees_ecriture on actes_durees for all
  using (app_is_admin()) with check (app_is_admin());

drop policy if exists reglages_planning_lecture on reglages_planning;
create policy reglages_planning_lecture on reglages_planning for select using (app_is_active_soignante());
drop policy if exists reglages_planning_ecriture on reglages_planning;
create policy reglages_planning_ecriture on reglages_planning for all
  using (app_is_admin()) with check (app_is_admin());

-- Droits du rôle applicatif (s'il existe déjà ; sinon scripts/create-app-role.sql les accordera).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'isabelle_app') then
    grant select, insert, update, delete on actes_durees, reglages_planning to isabelle_app;
  end if;
end $$;
