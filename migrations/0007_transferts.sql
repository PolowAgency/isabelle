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
