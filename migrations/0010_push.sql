-- Isabelle — Tournée — Lot 8 : notifications push (PWA)
--
-- Un abonnement = un appareil d'une soignante, créé après un consentement explicite
-- (permission du navigateur + activation dans l'application). Le texte des
-- notifications ne contient JAMAIS de donnée médicale (voir src/lib/push-messages.ts).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  soignante_id uuid not null references soignantes (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  notifier_transferts boolean not null default true,
  notifier_urgences boolean not null default true,
  consenti_le timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index push_subscriptions_soignante_idx on push_subscriptions (soignante_id);

alter table push_subscriptions enable row level security;

-- Chacune ne gère que ses propres abonnements.
create policy push_subscriptions_own on push_subscriptions
  for all
  using (app_is_active_soignante() and soignante_id = app_current_soignante_id())
  with check (app_is_active_soignante() and soignante_id = app_current_soignante_id());

-- Enregistre (ou met à jour) l'abonnement d'un appareil au nom de la soignante courante.
-- Si l'appareil était abonné pour quelqu'un d'autre (téléphone prêté), il passe à la
-- soignante courante : on ne notifie jamais la mauvaise personne.
create function push_enregistrer(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_transferts boolean,
  p_urgences boolean
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
    raise exception 'Abonnement refusé.' using errcode = '42501';
  end if;

  insert into push_subscriptions (soignante_id, endpoint, p256dh, auth, notifier_transferts, notifier_urgences)
  values (v_soignante, p_endpoint, p_p256dh, p_auth, p_transferts, p_urgences)
  on conflict (endpoint) do update
    set soignante_id = excluded.soignante_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        notifier_transferts = excluded.notifier_transferts,
        notifier_urgences = excluded.notifier_urgences,
        consenti_le = case when push_subscriptions.soignante_id = excluded.soignante_id
                           then push_subscriptions.consenti_le else now() end;
end;
$$;

-- Abonnements à notifier pour un motif ('transfert' ou 'urgence'), à l'exclusion de
-- l'auteure. Réservée aux soignantes actives ; ne renvoie que les comptes actifs et non expirés.
create function push_destinataires(p_motif text, p_cibles uuid[] default null, p_exclure uuid default null)
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
  if p_motif not in ('transfert', 'urgence') then
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
      and ((p_motif = 'transfert' and p.notifier_transferts) or (p_motif = 'urgence' and p.notifier_urgences));
end;
$$;

-- Supprime des abonnements devenus invalides (le service de push a répondu « disparu »).
create function push_supprimer(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_is_active_soignante() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  delete from push_subscriptions where id = any (p_ids);
end;
$$;

revoke all on function push_enregistrer(text, text, text, boolean, boolean) from public;
revoke all on function push_destinataires(text, uuid[], uuid) from public;
revoke all on function push_supprimer(uuid[]) from public;
