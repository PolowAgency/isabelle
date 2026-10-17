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
