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
