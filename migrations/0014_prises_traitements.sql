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
