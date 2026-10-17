-- Isabelle — mise à jour de la base : migrations 0011 à 0014
-- (actions rapides, durées et capacité, absences, suivi des traitements).
--
-- À exécuter UNE FOIS, avec le rôle propriétaire (SQL editor Supabase), APRÈS la mise à jour 0003→0010
-- et AVANT de déployer la nouvelle version de l'application. Tout est dans une seule transaction :
-- en cas d'erreur, rien n'est modifié. Les droits du rôle `isabelle_app` sont accordés par les
-- migrations elles-mêmes (le rôle existe déjà).
begin;

do $$
declare deja text := '';
begin
  if exists (select 1 from information_schema.columns where table_name = 'visites' and column_name = 'heure_arrivee') then deja := deja || 'heure_arrivee (0011) '; end if;
  if to_regclass('public.actes_durees') is not null then deja := deja || 'actes_durees (0012) '; end if;
  if to_regclass('public.absences') is not null then deja := deja || 'absences (0013) '; end if;
  if to_regclass('public.prises_traitement') is not null then deja := deja || 'prises_traitement (0014) '; end if;
  if deja <> '' then
    raise exception 'Cette mise à jour est déjà (en partie) appliquée : %. Ne pas la relancer.', deja;
  end if;
  if to_regclass('public.push_subscriptions') is null or to_regclass('public.audit_log') is null then
    raise exception 'Les migrations 0003 à 0010 ne sont pas appliquées : les exécuter d''abord.';
  end if;
end $$;

-- ============================================================================
-- migrations/0011_actions_rapides.sql
-- ============================================================================
-- Lot F : actions rapides sur la visite.
--  * heure d'arrivée chez le patient, distincte de l'heure de validation (heure_reelle) ;
--  * ordre des visites dans une tranche, désormais modifiable : on fige l'ordre actuel
--    (secteur, puis ordre existant) en numéros consécutifs par jour / tranche / soignante.
-- RLS : la table visites est déjà protégée, la nouvelle colonne l'est avec elle.

alter table visites add column if not exists heure_arrivee timestamptz;

with ordre_actuel as (
  select v.id,
         row_number() over (
           partition by v.date, v.tranche, v.soignante_id
           order by coalesce(s.ordre, 999), v.ordre_dans_passage, v.id
         ) as rang
  from visites v
  join patients p on p.id = v.patient_id
  left join secteurs s on s.id = p.secteur_id
)
update visites v
set ordre_dans_passage = o.rang
from ordre_actuel o
where o.id = v.id
  and v.ordre_dans_passage is distinct from o.rang;

-- ============================================================================
-- migrations/0012_durees_capacite.sql
-- ============================================================================
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

-- ============================================================================
-- migrations/0013_absences.sql
-- ============================================================================
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

-- ============================================================================
-- migrations/0014_prises_traitements.sql
-- ============================================================================
-- Lot I : suivi des traitements à chaque passage.
--  * prises_traitement : pour une visite validée, chaque traitement actif prévu à ce passage est
--    « administré », « refusé » ou « non administré » (commentaire facultatif, 300 caractères).
--    Une prise refusée ou non administrée génère une alerte pour l'équipe, jusqu'à ce que
--    quelqu'un l'ait prise en compte (alerte_traitee_*).
--  * prises_historique : trace immuable de chaque correction (qui, quand, avant / après).
-- RLS : réservée aux soignantes actives. L'historique n'est jamais modifiable ni supprimable
-- par l'application (droits SELECT / INSERT seulement).

create table if not exists prises_traitement (
  id                 uuid primary key default gen_random_uuid(),
  visite_id          uuid not null references visites (id) on delete cascade,
  traitement_id      uuid not null references traitements (id) on delete cascade,
  patient_id         uuid not null references patients (id) on delete cascade,
  statut             text not null check (statut in ('administre', 'refuse', 'non_administre')),
  commentaire        text check (commentaire is null or char_length(commentaire) <= 300),
  soignante_id       uuid references soignantes (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  alerte_traitee_at  timestamptz,
  alerte_traitee_par uuid references soignantes (id) on delete set null,
  constraint prises_une_par_visite unique (visite_id, traitement_id)
);

create index if not exists prises_patient_idx on prises_traitement (patient_id, created_at desc);
create index if not exists prises_alerte_idx on prises_traitement (created_at desc)
  where statut <> 'administre' and alerte_traitee_at is null;

create table if not exists prises_historique (
  id                  uuid primary key default gen_random_uuid(),
  prise_id            uuid not null references prises_traitement (id) on delete cascade,
  soignante_id        uuid references soignantes (id) on delete set null,
  created_at          timestamptz not null default now(),
  ancien_statut       text,
  nouveau_statut      text not null,
  ancien_commentaire  text,
  nouveau_commentaire text
);

create index if not exists prises_historique_prise_idx on prises_historique (prise_id, created_at);

alter table prises_traitement enable row level security;
alter table prises_historique enable row level security;

drop policy if exists prises_team_access on prises_traitement;
create policy prises_team_access on prises_traitement
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

drop policy if exists prises_historique_lecture on prises_historique;
create policy prises_historique_lecture on prises_historique for select using (app_is_active_soignante());
drop policy if exists prises_historique_ajout on prises_historique;
create policy prises_historique_ajout on prises_historique for insert with check (app_is_active_soignante());

-- Notifications : nouveau motif « traitement » (suit la préférence « urgences » de l'appareil).
create or replace function push_destinataires(p_motif text, p_cibles uuid[] default null, p_exclure uuid default null)
returns table (id uuid, soignante_id uuid, endpoint text, p256dh text, auth text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not app_is_active_soignante() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_motif not in ('transfert', 'urgence', 'traitement') then
    raise exception 'Motif inconnu.';
  end if;

  return query
    select p.id, p.soignante_id, p.endpoint, p.p256dh, p.auth
    from push_subscriptions p
    join soignantes s on s.id = p.soignante_id
    where s.actif
      and (s.date_fin is null or s.date_fin >= (now() at time zone 'Europe/Paris')::date)
      and (p_cibles is null or p.soignante_id = any (p_cibles))
      and (p_exclure is null or p.soignante_id <> p_exclure)
      and ((p_motif = 'transfert' and p.notifier_transferts)
        or (p_motif in ('urgence', 'traitement') and p.notifier_urgences));
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'isabelle_app') then
    grant select, insert, update, delete on prises_traitement to isabelle_app;
    grant select, insert on prises_historique to isabelle_app;
    revoke update, delete, truncate on prises_historique from isabelle_app;
  end if;
end $$;

-- Contrôles finaux : tout doit être présent, avec la sécurité par ligne activée.
do $$
declare t text;
begin
  foreach t in array array['actes_durees', 'reglages_planning', 'absences', 'prises_traitement', 'prises_historique'] loop
    if to_regclass('public.' || t) is null then raise exception 'Table manquante : %', t; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Sécurité par ligne non activée sur %', t;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_name = 'visites' and column_name = 'heure_arrivee') then
    raise exception 'Colonne heure_arrivee manquante';
  end if;
  if has_table_privilege('isabelle_app', 'public.prises_historique', 'UPDATE')
     or has_table_privilege('isabelle_app', 'public.prises_historique', 'DELETE') then
    raise exception 'isabelle_app ne doit pas pouvoir modifier prises_historique';
  end if;
  if not has_table_privilege('isabelle_app', 'public.absences', 'INSERT') then
    raise exception 'isabelle_app n''a pas accès à absences';
  end if;
end $$;

commit;

-- Résultat attendu : « Success. No rows returned ».
