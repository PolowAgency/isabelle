-- Isabelle — Tournée — schéma initial (V2, infrastructure portable HDS)
--
-- SQL brut, exécutable sur n'importe quel Postgres (Supabase en phase de
-- test, Scaleway/OVHcloud HDS en cible). Aucune dépendance à des objets
-- spécifiques à Supabase (pas de schéma `auth`, pas de `storage.objects`,
-- pas d'extension propriétaire).
--
-- Données de santé (RGPD, catégorie protégée) : RLS activée en
-- defense-in-depth sur toutes les tables. L'application (Server Actions /
-- Route Handlers uniquement, jamais le client) doit exécuter, au début de
-- chaque transaction ayant besoin d'accéder aux données :
--
--   select set_config('app.current_soignante_id', $1, true);  -- $1 = uuid de la soignante authentifiée (Auth.js)
--
-- Les policies ci-dessous n'autorisent l'accès que si cette variable de
-- session pointe vers une soignante active. Sans elle, aucun accès n'est
-- possible : la base reste fermée même si la chaîne DATABASE_URL fuit,
-- *à condition* que le rôle Postgres utilisé par l'application ne soit ni
-- superutilisateur, ni doté de l'attribut BYPASSRLS (à vérifier lors du
-- provisioning de chaque environnement — voir MIGRATION-HDS.md).

create extension if not exists pgcrypto;

-- =========================================================================
-- Tables
-- =========================================================================

create table soignantes (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  email text not null unique,
  password_hash text not null,
  couleur text not null default '#25453a',
  role text not null check (role in ('titulaire', 'remplacante')),
  actif boolean not null default true,
  remplace_id uuid references soignantes (id) on delete set null,
  date_debut date not null default current_date,
  date_fin date,
  created_at timestamptz not null default now()
);

comment on table soignantes is 'Comptes de connexion (Auth.js/Credentials). password_hash = argon2.';
comment on column soignantes.remplace_id is 'Renseigné si role = remplacante : soignante titulaire remplacée.';

create table secteurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ordre int not null default 0,
  couleur text not null default '#a9c4ab'
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  date_naissance date,
  telephone text,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  secteur_id uuid references secteurs (id) on delete set null,
  actif boolean not null default true,
  contact_urgence_nom text,
  contact_urgence_telephone text,
  contact_urgence_lien text,
  medecin_traitant_nom text,
  medecin_traitant_telephone text,
  created_at timestamptz not null default now(),
  created_by uuid references soignantes (id) on delete set null
);

create table acces_domicile (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references patients (id) on delete cascade,
  code_portail text,
  code_immeuble text,
  etage text,
  digicode_porte text,
  emplacement_cle text,
  presence_animal boolean not null default false,
  description_animal text,
  presence_aidant boolean not null default false,
  details_aidant text,
  stationnement text,
  notes_acces text,
  updated_at timestamptz not null default now(),
  updated_by uuid references soignantes (id) on delete set null
);

comment on table acces_domicile is 'Infos d''accès au domicile — l''écran qui fait gagner du temps aux remplaçantes.';

create table visites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  soignante_id uuid not null references soignantes (id),
  date date not null,
  passage text not null check (passage in ('matin', 'midi', 'soir')),
  ordre_dans_passage int not null default 0,
  actes text[] not null default '{}',
  duree_estimee_min int,
  statut text not null default 'prevue' check (statut in ('prevue', 'faite', 'absent', 'reportee', 'annulee')),
  heure_reelle timestamptz,
  created_at timestamptz not null default now(),
  unique (patient_id, date, passage)
);

comment on table visites is 'Une visite = un passage chez un patient. Jusqu''à 3 par jour (matin/midi/soir) : ne jamais dédupliquer par patient_id dans les vues journalières.';

create table transmissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  visite_id uuid references visites (id) on delete set null,
  soignante_id uuid not null references soignantes (id),
  contenu text not null,
  importance text not null default 'info' check (importance in ('info', 'attention', 'urgent')),
  lue_par uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table ordonnances (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  prescripteur text,
  date_prescription date,
  date_debut date,
  date_fin date,
  description text,
  fichier_key text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references soignantes (id) on delete set null
);

comment on column ordonnances.fichier_key is 'Clé de l''objet dans le bucket S3 privé (pas d''URL publique) — signer à la lecture, voir lib/storage.ts.';

create table documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  soignante_id uuid not null references soignantes (id),
  type text not null check (type in ('photo', 'document')),
  fichier_key text not null,
  legende text,
  created_at timestamptz not null default now()
);

create table traitements (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  libelle text not null,
  dosage text,
  passages text[] not null default '{}',
  actif boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Index
-- =========================================================================

create index visites_date_passage_idx on visites (date, passage);
create index visites_patient_id_idx on visites (patient_id);
create index visites_soignante_id_idx on visites (soignante_id);
create index transmissions_patient_id_created_at_idx on transmissions (patient_id, created_at desc);
create index ordonnances_date_fin_idx on ordonnances (date_fin) where active;
create index patients_secteur_id_idx on patients (secteur_id) where actif;
create index traitements_patient_id_idx on traitements (patient_id) where actif;
create index documents_patient_id_idx on documents (patient_id);
create index acces_domicile_patient_id_idx on acces_domicile (patient_id);

-- =========================================================================
-- Helpers RLS (session-scoped, définis par l'application à chaque requête)
-- =========================================================================

create function app_current_soignante_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_soignante_id', true), '')::uuid;
$$;

create function app_is_active_soignante()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from soignantes s
    where s.id = app_current_soignante_id()
      and s.actif = true
      and (s.date_fin is null or s.date_fin >= current_date)
  );
$$;

-- =========================================================================
-- RLS — équipe authentifiée active uniquement, aucun accès public
-- =========================================================================

alter table soignantes enable row level security;
alter table secteurs enable row level security;
alter table patients enable row level security;
alter table acces_domicile enable row level security;
alter table visites enable row level security;
alter table transmissions enable row level security;
alter table ordonnances enable row level security;
alter table documents enable row level security;
alter table traitements enable row level security;

-- soignantes : lecture équipe (chips, filtres) réservée aux comptes actifs ;
-- l'écriture (création de remplaçantes, etc.) est gérée par les Server
-- Actions avec les mêmes vérifications côté application.
create policy soignantes_select_active on soignantes
  for select using (app_is_active_soignante());
create policy soignantes_all_active on soignantes
  for insert with check (app_is_active_soignante());
create policy soignantes_update_active on soignantes
  for update using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy secteurs_team_access on secteurs
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy patients_team_access on patients
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy acces_domicile_team_access on acces_domicile
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy visites_team_access on visites
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy transmissions_team_access on transmissions
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy ordonnances_team_access on ordonnances
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy documents_team_access on documents
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());

create policy traitements_team_access on traitements
  for all using (app_is_active_soignante()) with check (app_is_active_soignante());
