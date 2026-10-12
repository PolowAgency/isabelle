-- Isabelle — Tournée — fonction d'authentification
--
-- Le callback `authorize()` d'Auth.js doit pouvoir lire le hash de mot de
-- passe d'une soignante à partir de son email, *avant* qu'une session
-- n'existe (donc avant que app.current_soignante_id ne soit définie). La
-- policy RLS sur `soignantes` (migration 0001) ne le permettrait pas.
--
-- On expose donc une fonction security definer strictement limitée aux
-- colonnes nécessaires à la vérification du mot de passe — jamais un accès
-- direct à la table depuis ce chemin non authentifié.

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
  date_fin date
)
language sql
security definer
stable
as $$
  select s.id, s.prenom, s.nom, s.email, s.password_hash, s.couleur, s.role, s.actif, s.date_fin
  from soignantes s
  where lower(s.email) = lower(p_email)
  limit 1;
$$;

revoke all on function auth_lookup_soignante(text) from public;
