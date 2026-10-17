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
