-- =====================================================================
-- Isabelle — mise à jour de la base : migrations 0003 à 0010
-- =====================================================================
-- À coller dans l'éditeur SQL de Supabase (projet « test »), connecté avec le
-- rôle propriétaire (postgres). Prérequis : migrations 0001 et 0002 déjà appliquées.
--
-- AVANT :
--   1. Faire une sauvegarde (Supabase : Database > Backups, ou pg_dump).
--   2. Préparer le déploiement du nouveau code : l'ancien code ne fonctionne
--      plus avec ce schéma (création de visites : la colonne « passage » devient
--      générée) et le nouveau code ne fonctionne pas sans lui. Appliquer ce script
--      puis déployer tout de suite après.
--
-- Le script est dans UNE transaction : en cas d'erreur, rien n'est modifié.
-- Il refuse de s'exécuter s'il détecte que tout ou partie est déjà appliqué.
-- Les visites existantes sont conservées (tranche déduite du passage :
-- matin -> 8-10, midi -> 12-14, soir -> 18-20).
-- Isabelle (titulaire prénommée « Isabelle ») devient administratrice.
-- =====================================================================

begin;

-- ---- Contrôles préalables -------------------------------------------------
do $controle$
declare
  deja text[] := array[]::text[];
begin
  if to_regclass('public.visites') is null
     or to_regclass('public.soignantes') is null
     or to_regprocedure('auth_lookup_soignante(text)') is null then
    raise exception 'Base inattendue : les migrations 0001 et 0002 ne semblent pas appliquées. Rien n''a été modifié.';
  end if;

  if to_regclass('public.series_visites') is not null then deja := deja || 'series_visites (0004)'::text; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visites' and column_name = 'tranche') then deja := deja || 'visites.tranche (0005)'::text; end if;
  if to_regclass('public.visites_historique') is not null then deja := deja || 'visites_historique (0006)'::text; end if;
  if to_regclass('public.transferts') is not null then deja := deja || 'transferts (0007)'::text; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'soignantes' and column_name = 'est_admin') then deja := deja || 'soignantes.est_admin (0008)'::text; end if;
  if to_regclass('public.audit_log') is not null then deja := deja || 'audit_log (0009)'::text; end if;
  if to_regclass('public.push_subscriptions') is not null then deja := deja || 'push_subscriptions (0010)'::text; end if;

  if array_length(deja, 1) > 0 then
    raise exception 'Déjà appliqué en tout ou partie (%). Ne relancez pas ce script : dites-le à la personne qui vous l''a fourni. Rien n''a été modifié.', array_to_string(deja, ', ');
  end if;
end
$controle$;


-- =====================================================================
-- migrations/0003_rls_helper_security_definer.sql
-- =====================================================================

-- Isabelle — Tournée — correctif RLS : récursion infinie avec un rôle restreint
--
-- Dans 0001, app_is_active_soignante() lit `soignantes`, dont la policy
-- (soignantes_select_active) rappelle app_is_active_soignante() : avec un rôle
-- applicatif conforme à la consigne (ni propriétaire des tables, ni BYPASSRLS)
-- toute requête échoue avec « stack depth limit exceeded ». Le défaut passait
-- inaperçu tant que l'application se connectait avec un rôle qui contourne la
-- RLS (propriétaire / superuser).
--
-- La fonction devient SECURITY DEFINER : la vérification « soignante active »
-- s'exécute avec les droits du propriétaire de la fonction, hors RLS, ce qui
-- coupe la récursion. search_path figé pour éviter tout détournement.
-- Sans effet pour un rôle qui contourne déjà la RLS.

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
      and (s.date_fin is null or s.date_fin >= current_date)
  );
$$;

-- =====================================================================
-- migrations/0004_series_visites.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 1 : soins récurrents (séries de visites)
--
-- Une série décrit un soin chronique (ex. prise de sang tous les jours
-- pendant un mois). Les visites sont générées une fois pour toutes à la
-- création (une ligne `visites` par jour concerné) et gardent un lien
-- `serie_id` pour pouvoir être modifiées / annulées « avec les suivantes ».
-- Supprimer une série ne supprime jamais les visites déjà générées.

create table series_visites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  soignante_id uuid not null references soignantes (id),
  date_debut date not null,
  date_fin date not null,
  frequence text not null check (
    frequence in ('quotidien', 'un_jour_sur_deux', 'une_semaine_sur_deux', 'jours_semaine')
  ),
  -- Jours ISO de la semaine : 1 = lundi … 7 = dimanche.
  jours_semaine smallint[] not null default '{}',
  passages text[] not null,
  actes text[] not null default '{}',
  duree_estimee_min int,
  created_by uuid references soignantes (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint series_visites_dates_check check (date_fin >= date_debut),
  constraint series_visites_passages_check check (
    cardinality(passages) > 0 and passages <@ array['matin', 'midi', 'soir']
  ),
  constraint series_visites_jours_check check (
    jours_semaine <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and (frequence <> 'jours_semaine' or cardinality(jours_semaine) > 0)
  )
);

comment on table series_visites is 'Soin récurrent : modèle à partir duquel les visites (visites.serie_id) ont été générées.';
comment on column series_visites.jours_semaine is 'Jours ISO (1 = lundi … 7 = dimanche). Obligatoire pour jours_semaine ; optionnel pour une_semaine_sur_deux (défaut : jour de date_debut).';

alter table visites
  add column serie_id uuid references series_visites (id) on delete set null;

create index visites_serie_id_idx on visites (serie_id, date) where serie_id is not null;
create index series_visites_patient_id_idx on series_visites (patient_id);

alter table series_visites enable row level security;

create policy series_visites_team_access on series_visites
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

-- =====================================================================
-- migrations/0005_tranches_horaires.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 2 : tranches horaires et plusieurs passages par jour
--
-- `visites.tranche` devient la donnée de référence ; `visites.passage`
-- (matin / midi / soir) en est dérivé par une colonne générée, avec la règle
-- de src/lib/tranches.ts : matin avant 12 h, midi de 12 h à 16 h, soir à
-- partir de 16 h. Les vues existantes continuent donc de lire `passage`.
--
-- Données existantes : matin -> 8-10, midi -> 12-14, soir -> 18-20.
-- L'unicité passe de (patient, date, passage) à (patient, date, tranche) :
-- un même patient peut avoir plusieurs visites le même jour.

-- 1. tranche, remplie depuis l'ancien passage ------------------------------

alter table visites add column tranche text;

update visites
set tranche = case passage
  when 'matin' then '8-10'
  when 'midi' then '12-14'
  else '18-20'
end;

alter table visites alter column tranche set not null;

alter table visites
  add constraint visites_tranche_check
  check (tranche in ('6-8', '8-10', '10-12', '12-14', '14-16', '16-18', '18-20', '20-21'));

-- 2. passage devient une colonne générée -----------------------------------
-- Postgres ne sait pas convertir une colonne ordinaire en colonne générée :
-- on la recrée (sa valeur est entièrement recalculée depuis `tranche`).
-- La contrainte unique et l'index qui la portaient sont supprimés avec elle.

alter table visites drop constraint visites_patient_id_date_passage_key;
drop index visites_date_passage_idx;
alter table visites drop column passage;

alter table visites
  add column passage text generated always as (
    case
      when tranche in ('6-8', '8-10', '10-12') then 'matin'
      when tranche in ('12-14', '14-16') then 'midi'
      else 'soir'
    end
  ) stored not null;

-- 3. nouvelle unicité et index ---------------------------------------------

alter table visites
  add constraint visites_patient_id_date_tranche_key unique (patient_id, date, tranche);

create index visites_date_passage_idx on visites (date, passage);
create index visites_date_tranche_idx on visites (date, tranche);

comment on column visites.tranche is 'Tranche horaire du passage (6-8, 8-10, 10-12, 12-14, 14-16, 16-18, 18-20, 20-21). Référence ; passage en est dérivé.';
comment on column visites.passage is 'Colonne générée depuis tranche (matin < 12 h, midi 12-16 h, soir >= 16 h). Ne pas écrire.';
comment on table visites is 'Une visite = un passage chez un patient dans une tranche horaire. Plusieurs par jour et par patient : ne jamais dédupliquer par patient_id dans les vues journalières.';

-- 4. séries : passages -> tranches ------------------------------------------

alter table series_visites add column tranches text[];

update series_visites s
set tranches = (
  select array_agg(distinct case p when 'matin' then '8-10' when 'midi' then '12-14' else '18-20' end)
  from unnest(s.passages) as p
);

alter table series_visites alter column tranches set not null;

-- Supprime aussi series_visites_passages_check (contrainte portant sur la colonne).
alter table series_visites drop column passages;

alter table series_visites
  add constraint series_visites_tranches_check check (
    cardinality(tranches) > 0
    and tranches <@ array['6-8', '8-10', '10-12', '12-14', '14-16', '16-18', '18-20', '20-21']
  );

-- =====================================================================
-- migrations/0006_historique_report.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 4 : historique des modifications et report au lendemain
--
-- visites_historique : une ligne par champ modifié sur une visite (statut,
-- actes, tranche, soignante…), pour la traçabilité. Les valeurs peuvent
-- contenir des libellés d'actes : table protégée par la même RLS que les
-- autres tables cliniques, jamais écrite dans les logs applicatifs.
--
-- visites.report_de_id : visite d'origine d'un report « au lendemain ».
-- L'index unique rend l'opération idempotente (une visite ne peut engendrer
-- qu'un seul report).

create table visites_historique (
  id uuid primary key default gen_random_uuid(),
  visite_id uuid not null references visites (id) on delete cascade,
  soignante_id uuid references soignantes (id) on delete set null,
  created_at timestamptz not null default now(),
  champ text not null check (champ in ('statut', 'actes', 'tranche', 'date', 'soignante')),
  ancienne_valeur text,
  nouvelle_valeur text
);

create index visites_historique_visite_idx on visites_historique (visite_id, created_at desc);

alter table visites_historique enable row level security;

create policy visites_historique_team_access on visites_historique
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

alter table visites
  add column report_de_id uuid references visites (id) on delete set null;

create unique index visites_report_de_id_key on visites (report_de_id) where report_de_id is not null;

-- =====================================================================
-- migrations/0007_transferts.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 5 : transferts de patient / visite / série entre soignantes
--
-- Un transfert vise exactement une cible : un patient (toutes ses visites à
-- venir), une visite, ou une série. La destinataire l'accepte ou le refuse
-- (onglet Alertes). À l'acceptation, l'application déplace vers elle les
-- visites futures encore « prevue » de l'émettrice ; les visites déjà
-- faites, absentes, reportées ou annulées ne changent jamais de soignante.

create table transferts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete cascade,
  visite_id uuid references visites (id) on delete cascade,
  serie_id uuid references series_visites (id) on delete cascade,
  de_soignante_id uuid not null references soignantes (id),
  vers_soignante_id uuid not null references soignantes (id),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'accepte', 'refuse')),
  message text,
  -- La réponse (accepté / refusé) reste visible de l'émettrice jusqu'à ce qu'elle l'ait lue.
  reponse_vue boolean not null default false,
  created_at timestamptz not null default now(),
  traite_at timestamptz,
  constraint transferts_une_cible check (num_nonnulls(patient_id, visite_id, serie_id) = 1),
  constraint transferts_soignantes_distinctes check (de_soignante_id <> vers_soignante_id),
  constraint transferts_traite_check check ((statut = 'en_attente') = (traite_at is null))
);

-- Pas deux demandes en attente identiques vers la même destinataire.
create unique index transferts_en_attente_key
  on transferts (coalesce(patient_id, visite_id, serie_id), vers_soignante_id)
  where statut = 'en_attente';

create index transferts_vers_idx on transferts (vers_soignante_id, statut);
create index transferts_de_idx on transferts (de_soignante_id, statut);

alter table transferts enable row level security;

create policy transferts_team_access on transferts
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

-- =====================================================================
-- migrations/0008_admin_session.sql
-- =====================================================================

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

-- =====================================================================
-- migrations/0009_audit_login.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 0 : journal d'audit et limitation des tentatives de connexion
--
-- audit_log : QUI a fait QUOI sur QUELLE entité, QUAND. Jamais de contenu
-- médical : uniquement des identifiants et un type d'action. Insertion par
-- toute soignante active (pour elle-même), lecture réservée aux admins,
-- aucune modification ni suppression.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  soignante_id uuid references soignantes (id) on delete set null,
  action text not null,
  entite text not null,
  entite_id uuid,
  patient_id uuid references patients (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Empreinte (HMAC) de l'adresse IP, jamais l'adresse elle-même.
  ip_hash text
);

create index audit_log_created_at_idx on audit_log (created_at desc);
create index audit_log_patient_idx on audit_log (patient_id, created_at desc) where patient_id is not null;
create index audit_log_soignante_idx on audit_log (soignante_id, created_at desc);

alter table audit_log enable row level security;

create policy audit_log_insert_self on audit_log
  for insert with check (app_is_active_soignante() and soignante_id = app_current_soignante_id());

create policy audit_log_select_admin on audit_log
  for select using (app_is_admin());

-- Écriture applicative : fonction security definer qui n'autorise une soignante
-- à journaliser que ses propres actions, avec un dédoublonnage optionnel (la
-- lecture d'une fiche rechargée dix fois ne produit qu'une ligne). Le dédoublonnage
-- passe par une fonction car la RLS interdit aux non-admins de relire audit_log.
create function audit_enregistrer(
  p_action text,
  p_entite text,
  p_entite_id uuid,
  p_patient_id uuid,
  p_ip_hash text,
  p_dedoublonner_minutes int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soignante uuid := app_current_soignante_id();
begin
  if v_soignante is null or not app_is_active_soignante() then
    raise exception 'Journalisation refusée.' using errcode = '42501';
  end if;

  if p_dedoublonner_minutes > 0 and exists (
    select 1 from audit_log a
    where a.soignante_id = v_soignante
      and a.action = p_action
      and a.entite = p_entite
      and a.entite_id is not distinct from p_entite_id
      and a.patient_id is not distinct from p_patient_id
      and a.created_at > now() - make_interval(mins => p_dedoublonner_minutes)
  ) then
    return;
  end if;

  insert into audit_log (soignante_id, action, entite, entite_id, patient_id, ip_hash)
  values (v_soignante, p_action, p_entite, p_entite_id, p_patient_id, p_ip_hash);
end;
$$;

revoke all on function audit_enregistrer(text, text, uuid, uuid, text, int) from public;

-- Pas de policy update / delete : refusé par la RLS. Le trigger ci-dessous
-- l'interdit aussi aux rôles qui contournent la RLS (propriétaire). Purge de
-- rétention : opération DBA explicite (désactiver le trigger le temps de la purge).
create function audit_log_immuable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Le journal d''audit est en ajout seul.' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
  before update or delete on audit_log
  for each row execute function audit_log_immuable();

-- Tentatives de connexion : accessibles uniquement via les fonctions
-- security definer ci-dessous (avant authentification, il n'y a pas encore de
-- soignante courante). RLS activée sans policy : aucun accès direct.

create table login_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text,
  succes boolean not null,
  created_at timestamptz not null default now()
);

create index login_attempts_email_idx on login_attempts (email_hash, created_at desc);
create index login_attempts_ip_idx on login_attempts (ip_hash, created_at desc) where ip_hash is not null;

alter table login_attempts enable row level security;

-- Échecs récents (15 min) depuis la dernière connexion réussie de cet email,
-- et échecs récents depuis cette adresse.
create function auth_login_etat(p_email_hash text, p_ip_hash text)
returns table (echecs_email int, echecs_ip int, dernier_echec_email timestamptz, dernier_echec_ip timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*)::int from login_attempts a
      where a.email_hash = p_email_hash and not a.succes
        and a.created_at > now() - interval '15 minutes'
        and a.created_at > coalesce(
          (select max(b.created_at) from login_attempts b where b.email_hash = p_email_hash and b.succes),
          '-infinity')),
    (select count(*)::int from login_attempts a
      where p_ip_hash is not null and a.ip_hash = p_ip_hash and not a.succes
        and a.created_at > now() - interval '15 minutes'),
    (select max(a.created_at) from login_attempts a
      where a.email_hash = p_email_hash and not a.succes and a.created_at > now() - interval '15 minutes'),
    (select max(a.created_at) from login_attempts a
      where p_ip_hash is not null and a.ip_hash = p_ip_hash and not a.succes
        and a.created_at > now() - interval '15 minutes');
$$;

-- Enregistre une tentative et la journalise dans l'audit (sans mot de passe ni email en clair).
create function auth_login_enregistrer(
  p_email_hash text,
  p_ip_hash text,
  p_succes boolean,
  p_soignante_id uuid,
  p_motif text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_attempts (email_hash, ip_hash, succes) values (p_email_hash, p_ip_hash, p_succes);

  insert into audit_log (soignante_id, action, entite, entite_id, ip_hash)
  values (
    p_soignante_id,
    case when p_succes then 'connexion' when p_motif = 'bloque' then 'connexion_bloquee' else 'connexion_echec' end,
    'soignante',
    p_soignante_id,
    p_ip_hash
  );

  -- Ménage : on ne garde pas les tentatives plus de 30 jours.
  delete from login_attempts where created_at < now() - interval '30 days';
end;
$$;

revoke all on function auth_login_etat(text, text) from public;
revoke all on function auth_login_enregistrer(text, text, boolean, uuid, text) from public;

-- =====================================================================
-- migrations/0010_push.sql
-- =====================================================================

-- Isabelle — Tournée — Lot 8 : notifications push (PWA)
--
-- Un abonnement = un appareil d'une soignante, créé après un consentement explicite
-- (permission du navigateur + activation dans l'application). Le texte des
-- notifications ne contient JAMAIS de donnée médicale (voir src/lib/push-messages.ts).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  soignante_id uuid not null references soignantes (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  notifier_transferts boolean not null default true,
  notifier_urgences boolean not null default true,
  consenti_le timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index push_subscriptions_soignante_idx on push_subscriptions (soignante_id);

alter table push_subscriptions enable row level security;

-- Chacune ne gère que ses propres abonnements.
create policy push_subscriptions_own on push_subscriptions
  for all
  using (app_is_active_soignante() and soignante_id = app_current_soignante_id())
  with check (app_is_active_soignante() and soignante_id = app_current_soignante_id());

-- Enregistre (ou met à jour) l'abonnement d'un appareil au nom de la soignante courante.
-- Si l'appareil était abonné pour quelqu'un d'autre (téléphone prêté), il passe à la
-- soignante courante : on ne notifie jamais la mauvaise personne.
create function push_enregistrer(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_transferts boolean,
  p_urgences boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soignante uuid := app_current_soignante_id();
begin
  if v_soignante is null or not app_is_active_soignante() then
    raise exception 'Abonnement refusé.' using errcode = '42501';
  end if;

  insert into push_subscriptions (soignante_id, endpoint, p256dh, auth, notifier_transferts, notifier_urgences)
  values (v_soignante, p_endpoint, p_p256dh, p_auth, p_transferts, p_urgences)
  on conflict (endpoint) do update
    set soignante_id = excluded.soignante_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        notifier_transferts = excluded.notifier_transferts,
        notifier_urgences = excluded.notifier_urgences,
        consenti_le = case when push_subscriptions.soignante_id = excluded.soignante_id
                           then push_subscriptions.consenti_le else now() end;
end;
$$;

-- Abonnements à notifier pour un motif ('transfert' ou 'urgence'), à l'exclusion de
-- l'auteure. Réservée aux soignantes actives ; ne renvoie que les comptes actifs et non expirés.
create function push_destinataires(p_motif text, p_cibles uuid[] default null, p_exclure uuid default null)
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
  if p_motif not in ('transfert', 'urgence') then
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
      and ((p_motif = 'transfert' and p.notifier_transferts) or (p_motif = 'urgence' and p.notifier_urgences));
end;
$$;

-- Supprime des abonnements devenus invalides (le service de push a répondu « disparu »).
create function push_supprimer(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_is_active_soignante() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  delete from push_subscriptions where id = any (p_ids);
end;
$$;

revoke all on function push_enregistrer(text, text, text, boolean, boolean) from public;
revoke all on function push_destinataires(text, uuid[], uuid) from public;
revoke all on function push_supprimer(uuid[]) from public;

-- ---- Contrôles finaux (annulent tout en cas d'anomalie) --------------------
do $verif$
declare
  manquants text[] := array[]::text[];
  nb_admins int;
  nb_sans_tranche int;
begin
  if to_regclass('public.series_visites') is null then manquants := manquants || 'series_visites'::text; end if;
  if to_regclass('public.visites_historique') is null then manquants := manquants || 'visites_historique'::text; end if;
  if to_regclass('public.transferts') is null then manquants := manquants || 'transferts'::text; end if;
  if to_regclass('public.audit_log') is null then manquants := manquants || 'audit_log'::text; end if;
  if to_regclass('public.login_attempts') is null then manquants := manquants || 'login_attempts'::text; end if;
  if to_regclass('public.push_subscriptions') is null then manquants := manquants || 'push_subscriptions'::text; end if;
  if to_regprocedure('app_is_admin()') is null then manquants := manquants || 'app_is_admin'::text; end if;
  if to_regprocedure('audit_enregistrer(text,text,uuid,uuid,text,integer)') is null then manquants := manquants || 'audit_enregistrer'::text; end if;
  if array_length(manquants, 1) > 0 then
    raise exception 'Objets manquants après migration : %', array_to_string(manquants, ', ');
  end if;

  select count(*) into nb_sans_tranche from visites where tranche is null or passage is null;
  if nb_sans_tranche > 0 then
    raise exception '% visite(s) sans tranche ou passage : migration annulée.', nb_sans_tranche;
  end if;

  select count(*) into nb_admins from soignantes where est_admin and actif;
  if nb_admins = 0 then
    raise notice 'ATTENTION : aucun administrateur. Désignez-en un (voir README, « Administrateurs »).';
  else
    raise notice 'OK : % administrateur(s) actif(s).', nb_admins;
  end if;
end
$verif$;

commit;

-- =====================================================================
-- PARTIE 2 — rôle restreint de l'application (à exécuter APRÈS le commit ci-dessus)
-- =====================================================================
-- L'application refuse de démarrer en production si DATABASE_URL utilise un
-- rôle qui contourne la sécurité par ligne (le rôle « postgres » de Supabase
-- la contourne). Ce rôle n'a pas ce droit.

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

-- Mot de passe du rôle : à définir séparément (ne jamais l'écrire dans un fichier partagé), par exemple :
--   alter role isabelle_app password '…un mot de passe long et aléatoire…';
-- Puis, dans les variables d'environnement de l'hébergeur, DATABASE_URL devient :
--   postgresql://isabelle_app.<ref-du-projet>:<mot-de-passe>@<hote-du-pooler>:6543/postgres
