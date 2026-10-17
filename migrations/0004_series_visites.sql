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
