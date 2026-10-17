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

Appliquer **dans l'ordre** tous les fichiers de `migrations/` (`0001` à `0007`,
SQL editor Supabase ou `psql`) :

| Migration | Contenu |
| --- | --- |
| `0001_init` / `0002_auth_lookup` | schéma initial, RLS, connexion |
| `0003_rls_helper_security_definer` | correctif RLS : sans lui, un rôle applicatif conforme (non propriétaire, sans `BYPASSRLS`) échoue en « stack depth limit exceeded » |
| `0004_series_visites` | soins récurrents (séries) |
| `0005_tranches_horaires` | tranches horaires, plusieurs passages par jour, `passage` dérivé de la tranche |
| `0006_historique_report` | historique des modifications, report au lendemain |
| `0007_transferts` | transferts de patient / visite / série |

Toute évolution de schéma = nouvelle migration, puis répercutée dans
`src/lib/schema.ts`. Jamais d'`ALTER` hors migration. Puis :

```bash
npm run bootstrap:team   # crée les 3 comptes titulaires (mots de passe affichés une fois)
npm run seed             # données fictives (60 patients, 4 semaines de tournées)
npm run db:reset         # repart de zéro côté données patients
```

### Lancer

```bash
npm run dev
```

### Tests

```bash
npm test   # tests unitaires des fonctions pures (récurrence, tranches, semaine, CSV)
```

### Mode démo (sans base)

Avec `DEMO_MODE=true` en développement (jamais actif en production), si la
base est injoignable, l'appli bascule sur des données fictives et accepte
`isabelle@cabinet-test.local` avec n'importe quel mot de passe.

## Fonctionnement

- **Tournée** : par défaut la *Journée*, en timeline par tranche horaire
  (6-8, 8-10, 10-12, 12-14, 14-16, 16-18, 18-20, 20-21) avec compteur
  « faites / à faire » et état de chaque tranche (en cours, en retard,
  terminée). Les onglets Matin / Midi / Soir filtrent par passage, groupé par
  secteur. Bouton ✓ ou glissement à droite = faite ; glissement à gauche =
  absente / « À demain ». L'écran se rafraîchit seul toutes les 45 s.
- **Une visite se valide avec au moins un acte** (contrôle serveur + écran de
  choix des actes). Un passage validé peut être corrigé ; chaque modification
  est tracée dans `visites_historique`.
- **Soins récurrents** : à la création, « Soin récurrent » (tous les jours, un
  jour sur deux, une semaine sur deux, jours choisis) pendant N
  jours / semaines / mois ou jusqu'à une date. Les visites sont générées en une
  transaction ; on peut modifier / annuler « cette visite » ou « cette visite et
  les suivantes » (jamais celles déjà faites).
- **Plusieurs passages par jour** : une visite par tranche, plusieurs tranches
  choisies en une action. `visites.passage` est une colonne générée depuis la
  tranche. Unicité : un patient / une date / une tranche.
- **Semaine** : jour courant en premier, navigation d'une semaine à l'autre,
  poste « du matin / du soir » de chaque soignante déduit de ses tranches.
- **Transferts** : depuis une fiche patient ou une visite, demande à une
  collègue, qui accepte ou refuse dans l'onglet Alertes (pastille de compteur).
  À l'acceptation, seules les visites futures « prévues » changent de
  soignante.
- Annuler une visite = statut `annulee` ; aucune visite n'est supprimée
  physiquement par l'application.
- Dates et passages calculés en heure de Paris (le serveur tourne en UTC).
- Installable sur l'écran d'accueil (manifest + icône générée).

## Export du journal des passages (bilan comptable)

*Compte → Journal des passages (export)* : date, tranche, patient, soignante,
actes, statut, heure réelle, sur la période choisie.

- **CSV** (séparateur `;`, UTF-8 avec BOM, ouvrable directement dans Excel) :
  `/api/export/passages?du=AAAA-MM-JJ&au=AAAA-MM-JJ[&soignante=<id>]`.
- **PDF** : bouton « PDF / Imprimer » puis « Enregistrer au format PDF » (page
  mise en forme pour l'impression, sans bibliothèque PDF à maintenir).
- **Droits** : Isabelle (même règle que `requireIsabelleAdminId`) exporte toute l'équipe ou une
  soignante ; chaque autre soignante n'exporte que ses propres passages (imposé
  côté serveur, 403 sinon). Période limitée à 366 jours. Réponses jamais mises
  en cache, aucun contenu dans les logs.

## Sauvegarde et restauration

Le journal des passages ne sert qu'à la comptabilité : il **ne remplace pas**
une sauvegarde de la base.

**Sauvegarde Postgres**

- Hébergeur : activer les sauvegardes automatiques (Supabase : sauvegardes
  quotidiennes selon le plan, PITR en option ; Scaleway / OVHcloud : sauvegardes
  managées). Vérifier la durée de rétention et que l'hébergeur est HDS en usage
  réel.
- En complément, `scripts/backup-postgres.sh` (pg_dump au format custom, vérifie
  l'archive, purge au-delà de `RETENTION_DAYS`) à planifier, par exemple chaque
  nuit :

  ```cron
  30 2 * * * DATABASE_URL_BACKUP="postgres://backup_user:…@hote:5432/base" BACKUP_DIR=/var/backups/isabelle /chemin/scripts/backup-postgres.sh
  ```

  `backup_user` doit pouvoir lire toutes les lignes malgré la RLS (propriétaire
  des tables ou rôle dédié `BYPASSRLS`) — **jamais** le rôle de l'application.
- Les sauvegardes contiennent des données de santé : dossier en `chmod 700`,
  copie hors site **chiffrée** (`age` / `gpg`), accès restreint.
- Fichiers (ordonnances, photos) : bucket S3 distinct de la base, à protéger par
  versioning ou réplication côté hébergeur.

**Restauration**

```bash
createdb isabelle_restore
pg_restore --no-owner --exit-on-error --dbname=isabelle_restore isabelle_AAAAMMJJ….dump
# vérifier : nombre de lignes de visites / patients, RLS active (pg_class.relrowsecurity)
# puis, selon l'hébergeur, rediriger DATABASE_URL ou restaurer dans la base cible
```

Les `GRANT` du rôle applicatif ne sont pas dans l'archive (`--no-privileges`) :
les rejouer après restauration (`GRANT` sur les tables, `EXECUTE` sur
`auth_lookup_soignante`). **Tester une restauration à blanc régulièrement** ;
la procédure ci-dessus a été vérifiée (mêmes effectifs avant / après, RLS
conservée).

**Aucune suppression physique des passages** : annuler = statut `annulee`.
Attention : `visites` est liée à `patients` en `ON DELETE CASCADE` — supprimer un
patient en base supprime son historique. L'application ne le propose pas ;
désactiver un patient (`actif = false`) plutôt que le supprimer.

## Structure

- `src/app/(app)/` — écrans authentifiés : Tournée, Semaine, Patients,
  Alertes, Compte
- `src/app/api/admin/soignantes/` — création de comptes (service admin)
- `src/lib/` — accès base (`db.ts`), schéma Drizzle, logique métier
- `src/components/` — par écran + primitives (`ui/`, `nav/`, `sheet/`)
- `migrations/` — schéma SQL + RLS
- `scripts/` — bootstrap, seed, reset
