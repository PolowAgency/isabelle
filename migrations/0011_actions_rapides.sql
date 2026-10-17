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
