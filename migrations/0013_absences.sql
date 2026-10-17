-- Lot H : absences et congés.
--  * absences : une soignante absente du date_debut au date_fin (inclus). Le motif est facultatif et
--    ne doit JAMAIS contenir de détail médical (« congés », « formation »…), 100 caractères au plus.
--    Visible de toute l'équipe ; chacune gère les siennes, un administrateur gère toutes.
--  * transferts : peuvent être bornés à une période (la période d'une absence) et rattachés à l'absence
--    qui les a provoqués, pour les accepter ou les refuser en lot.

create table if not exists absences (
  id           uuid primary key default gen_random_uuid(),
  soignante_id uuid not null references soignantes (id) on delete cascade,
  date_debut   date not null,
  date_fin     date not null,
  motif        text check (motif is null or char_length(motif) <= 100),
  created_by   uuid references soignantes (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint absences_dates check (date_fin >= date_debut and date_fin - date_debut <= 366)
);

create index if not exists absences_soignante_idx on absences (soignante_id, date_debut);
create index if not exists absences_fin_idx on absences (date_fin);

alter table absences enable row level security;

drop policy if exists absences_lecture on absences;
create policy absences_lecture on absences for select using (app_is_active_soignante());

drop policy if exists absences_ecriture on absences;
create policy absences_ecriture on absences for all
  using (app_is_active_soignante() and (soignante_id = app_current_soignante_id() or app_is_admin()))
  with check (app_is_active_soignante() and (soignante_id = app_current_soignante_id() or app_is_admin()));

alter table transferts
  add column if not exists absence_id uuid references absences (id) on delete set null,
  add column if not exists periode_debut date,
  add column if not exists periode_fin date;

alter table transferts drop constraint if exists transferts_periode_check;
alter table transferts add constraint transferts_periode_check
  check ((periode_debut is null) = (periode_fin is null) and (periode_fin is null or periode_fin >= periode_debut));

-- Deux demandes en attente identiques (même cible, même destinataire, même période) restent interdites.
drop index if exists transferts_en_attente_key;
create unique index transferts_en_attente_key
  on transferts (
    coalesce(patient_id, visite_id, serie_id),
    vers_soignante_id,
    coalesce(periode_debut, date '0001-01-01'),
    coalesce(periode_fin, date '0001-01-01')
  )
  where statut = 'en_attente';

create index if not exists transferts_absence_idx on transferts (absence_id) where absence_id is not null;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'isabelle_app') then
    grant select, insert, update, delete on absences to isabelle_app;
  end if;
end $$;
