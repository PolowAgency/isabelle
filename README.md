# Isabelle — Tournée

Application mobile-first pour coordonner la tournée de 3 infirmières libérales
qui suivent les mêmes patients (titulaires + remplaçantes ponctuelles). Outil
interne, non commercialisé.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Auth.js (NextAuth v5) : email + mot de passe (argon2), session JWT
- Postgres via Drizzle ORM, avec RLS (`app.current_soignante_id`)
- Stockage de fichiers S3-compatible (ordonnances, documents)

## RGPD & données de santé

L'application manipule des données de santé (art. 9 RGPD) :

- Pas d'inscription libre : comptes créés par Isabelle (admin) ou par
  `npm run bootstrap:team`.
- RLS strict sur toutes les tables cliniques : accès réservé à une soignante
  authentifiée et active. Le rôle Postgres de l'appli ne doit ni être
  superuser ni avoir `BYPASSRLS`.
- Fichiers dans un bucket privé, lus via URLs signées à durée limitée
  (`src/lib/storage.ts`).
- Comptes de remplaçantes limités par `date_fin`.
- Ne jamais logger de contenu médical (`console.log` interdit sur notes,
  traitements, transmissions).

**Hébergement :** Supabase standard n'est pas certifié HDS. Acceptable pour
un outil interne de test ; un usage réel à plus grande échelle ou pour des
tiers exige un hébergeur HDS (art. L1111-8 du Code de la santé publique).

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # renseigner DATABASE_URL, AUTH_SECRET, S3_*
```

### Base de données

Appliquer dans l'ordre `migrations/0001_init.sql` puis
`migrations/0002_auth_lookup.sql` (SQL editor Supabase ou `psql`). Puis :

```bash
npm run bootstrap:team   # crée les 3 comptes titulaires (mots de passe affichés une fois)
npm run seed             # données fictives (60 patients, 4 semaines de tournées)
npm run db:reset         # repart de zéro côté données patients
```

### Lancer

```bash
npm run dev
```

### Mode démo (sans base)

Avec `DEMO_MODE=true` en développement (jamais actif en production), si la
base est injoignable, l'appli bascule sur des données fictives et accepte
`isabelle@cabinet-test.local` avec n'importe quel mot de passe.

## Fonctionnement

- **Tournée** : visites du passage (matin / midi / soir) groupées par secteur.
  Bouton ✓ ou glissement à droite = faite ; glissement à gauche = absente /
  reportée. L'écran se rafraîchit seul toutes les 45 s pour refléter ce que
  les collègues ont validé.
- Dates et passages calculés en heure de Paris (le serveur tourne en UTC).
- Installable sur l'écran d'accueil (manifest + icône générée).

## Structure

- `src/app/(app)/` — écrans authentifiés : Tournée, Semaine, Patients,
  Alertes, Compte
- `src/app/api/admin/soignantes/` — création de comptes (service admin)
- `src/lib/` — accès base (`db.ts`), schéma Drizzle, logique métier
- `src/components/` — par écran + primitives (`ui/`, `nav/`, `sheet/`)
- `migrations/` — schéma SQL + RLS
- `scripts/` — bootstrap, seed, reset
