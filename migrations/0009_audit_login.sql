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
