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

Appliquer **dans l'ordre** tous les fichiers de `migrations/` (`0001` à `0010`,
SQL editor Supabase ou `psql`, avec le rôle **propriétaire**) :

| Migration | Contenu |
| --- | --- |
| `0001_init` / `0002_auth_lookup` | schéma initial, RLS, connexion |
| `0003_rls_helper_security_definer` | correctif RLS : sans lui, un rôle applicatif conforme (non propriétaire, sans `BYPASSRLS`) échoue en « stack depth limit exceeded » |
| `0004_series_visites` | soins récurrents (séries) |
| `0005_tranches_horaires` | tranches horaires, plusieurs passages par jour, `passage` dérivé de la tranche |
| `0006_historique_report` | historique des modifications, report au lendemain |
| `0007_transferts` | transferts de patient / visite / série |
| `0008_admin_session` | `est_admin` (+ garde-fous en base), `session_version`, mot de passe temporaire, jour courant à Paris dans la RLS, policies `soignantes` plus strictes |
| `0009_audit_login` | journal d'audit immuable, limitation des tentatives de connexion |
| `0010_push` | abonnements aux notifications push (RLS, fonctions d'envoi) |

Toute évolution de schéma = nouvelle migration, puis répercutée dans
`src/lib/schema.ts`. Jamais d'`ALTER` hors migration. Puis :

```bash
npm run bootstrap:team   # crée les 3 comptes titulaires (mots de passe affichés une fois)
npm run seed             # données fictives (60 patients, 4 semaines de tournées)
npm run db:reset         # repart de zéro côté données patients
```

Puis créer le rôle de l'application (à rejouer après chaque migration, idempotent) :

```bash
psql "$DATABASE_URL_OWNER" -f scripts/create-app-role.sql
psql "$DATABASE_URL_OWNER" -c "alter role isabelle_app password '…mot de passe fort…'"
```

### Rôle Postgres de l'application

`DATABASE_URL` doit désigner le rôle **`isabelle_app`** : ni superutilisateur, ni
`BYPASSRLS`, ni propriétaire des tables. Sinon la RLS (`app.current_soignante_id`)
ne protège rien : une fuite de la chaîne de connexion donnerait accès à toutes
les données de santé.

- **En production, l'application refuse de démarrer** si le rôle contourne la RLS
  (`src/instrumentation.ts`, message d'erreur sans fuite d'information).
- Vérification manuelle : `npm run check:rls` (code de sortie 1 si non conforme).
- Les migrations, `pg_dump` et les scripts d'administration utilisent le rôle
  propriétaire (`DATABASE_URL_OWNER`), jamais `isabelle_app`.
- Supabase : le rôle `postgres` a `BYPASSRLS` — créer `isabelle_app` et utiliser
  sa chaîne (pooler) dans `DATABASE_URL`.

### Administrateurs

Le droit d'administration est la colonne `soignantes.est_admin` (plus aucun test
sur un prénom ou un email). Seul un administrateur peut la modifier (écran
*Compte → Comptes et sécurité*), et **le dernier administrateur ne peut être ni
retiré ni désactivé** : contrôlé en base par un trigger, pas seulement par
l'application. La migration `0008` reprend une fois l'ancienne règle (titulaire
prénommée « Isabelle ») pour initialiser la colonne ; si aucun admin n'existe
ensuite, la migration l'indique (`notice`) — en désigner un en SQL, avec le rôle
propriétaire :

```sql
alter table soignantes disable trigger soignantes_garde_admin_update;
update soignantes set est_admin = true where email = 'isabelle@…';
alter table soignantes enable trigger soignantes_garde_admin_update;
```

### Chiffrement des codes d'accès au domicile

Codes portail / immeuble, digicode, emplacement de la clé et notes d'accès sont
chiffrés par l'application (AES-256-GCM, `src/lib/crypto.ts`) avant d'atteindre la
base. La clé `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`) est dans
l'environnement, **jamais en base ni dans le dépôt** : une sauvegarde ou une fuite
de la base seule ne révèle pas les codes. Chaque valeur est liée à son patient et
à son champ (recopier un texte chiffré ailleurs ne le rend pas lisible).

- **Perdre la clé = perdre les codes** : la sauvegarder séparément (gestionnaire
  de secrets), à part des sauvegardes de la base.
- **Données existantes** (une fois, après déploiement) :
  `DATABASE_URL_OWNER=… DATA_ENCRYPTION_KEY=… npm run encrypt:existing`
  (`-- --dry-run` pour compter sans écrire). Idempotent. Tant que ce n'est pas fait,
  les anciennes valeurs en clair restent lisibles.
- **Rotation de la clé** : générer la nouvelle clé ; mettre l'ancienne dans
  `DATA_ENCRYPTION_KEY_PREVIOUS` et la nouvelle dans `DATA_ENCRYPTION_KEY` ;
  redéployer ; lancer `npm run encrypt:existing` (re-chiffre tout avec la clé
  courante) ; vérifier ; retirer `DATA_ENCRYPTION_KEY_PREVIOUS`.
- Si un champ est illisible (clé absente ou erronée), la fiche s'affiche quand même
  et signale « informations d'accès illisibles » plutôt que de planter.

### Journal d'audit

Table `audit_log` (qui, quoi, quelle entité, quand, empreinte de l'IP) : ouverture
de fiche patient, lecture / modification de l'accès domicile, documents et
ordonnances, exports, transferts, séries, comptes, mots de passe, connexions
réussies / échouées / bloquées. **Jamais de contenu médical** : uniquement des
identifiants et un type d'action. Lecture réservée aux admins (*Compte → Comptes
et sécurité → Journal d'activité*, filtres patient / soignante / période),
insertion par chaque soignante pour elle-même, **aucune modification ni
suppression** (RLS + trigger). La purge de rétention est une opération DBA
explicite (désactiver `audit_log_no_update` le temps de la purge) ; définir une
durée de conservation (ex. 12 mois) avec Isabelle.

### Connexion et sessions

- **Limitation des tentatives** : à partir de 5 échecs sur un email (20 sur une
  adresse IP), délai croissant (30 s, 1 min, 2 min… plafonné à 15 min), levé
  automatiquement. Les emails inconnus sont comptés comme les autres, le message
  est toujours « Email ou mot de passe incorrect », et un compte inconnu coûte le
  même temps de calcul qu'un compte réel. Email et IP ne sont stockés que sous
  forme d'empreinte (HMAC, clé `AUTH_SECRET`).
- **Sessions** : 12 h d'inactivité au plus (glissantes), 3 jours depuis la
  connexion au plus. « Se déconnecter partout » (*Compte*) incrémente
  `session_version` : toutes les sessions ouvertes sont invalidées. Changer son mot
  de passe fait de même.
- **Mot de passe oublié** : un administrateur génère un mot de passe temporaire
  (affiché une seule fois). Il déconnecte la soignante partout et doit être changé
  dès la connexion suivante : aucune autre page n'est accessible avant. Les comptes
  créés par un admin ou par `bootstrap:team` démarrent aussi avec un mot de passe
  à changer.

### Validation, fichiers, en-têtes

- Toutes les Server Actions et routes API valident leurs entrées avec zod
  (`src/lib/validation.ts` : UUID, vraies dates ISO, énumérations, longueurs, liste
  blanche d'actes). Les messages sont en français, sans valeur saisie ni trace
  technique. Les erreurs « métier » sont renvoyées en résultat (`Resultat<T>`) car
  Next masque le message d'une exception en production.
- **Fichiers** : le type réel est contrôlé par signature (PDF, JPEG, PNG, WebP), pas
  par le type MIME annoncé ; les métadonnées des photos (EXIF dont GPS, XMP, IPTC,
  commentaires) sont supprimées avant stockage (l'orientation est conservée) ; le
  nom d'objet S3 est généré côté serveur. Les photos HEIC sont converties en JPEG
  dans le navigateur ; une HEIC qui arriverait telle quelle au serveur est refusée
  (impossible d'en retirer la géolocalisation).
- **En-têtes** (`next.config.mjs`, `src/middleware.ts`) : CSP stricte avec nonce par
  requête (aucun `unsafe-inline` pour les scripts), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy` (ni caméra, ni micro, ni
  géolocalisation), HSTS. Les pages sont rendues dynamiquement (nécessaire au nonce).
- **Dates** : toute la logique est dans `src/lib/date.ts`, en Europe/Paris (jour
  courant, semaine, passage) et en arithmétique de jours calendaires UTC (aucun
  jour sauté ni dupliqué au changement d'heure). La RLS évalue aussi la fin de
  contrat d'une remplaçante à l'heure de Paris.

### Mode hors-ligne et notifications (PWA)

**Mode hors-ligne** — *Compte → Mode hors-ligne → Activer sur cet appareil* (consentement
explicite, appareil par appareil) :

- Le service worker (`public/sw.js`) ne met en cache **que** des fichiers statiques et la
  coquille `/hors-ligne` (une page sans donnée). Jamais de page authentifiée ni d'API.
- L'**instantané du jour** (`GET /api/hors-ligne/snapshot`) contient uniquement les visites
  du jour de la soignante et les fiches de *ces* patients : contacts, accès au domicile
  (déchiffré), traitements, 5 dernières transmissions, prochaines visites. Ni photos, ni
  documents. Chaque fiche téléchargée est journalisée comme une consultation.
- Il est **chiffré dans le navigateur** (AES-GCM, clé WebCrypto non extractible conservée
  dans IndexedDB) et **purgé** : à la déconnexion (et à l'expiration / « se déconnecter
  partout », via la page de connexion), après 24 h, et à la désactivation du mode. Limite
  assumée : le chiffrement n'empêche pas l'usage de l'appli par quelqu'un qui tient
  l'appareil déverrouillé — le code de verrouillage du téléphone reste indispensable.
- Hors réseau, `/hors-ligne` affiche la tournée par tranche, les fiches, et permet de
  **valider (avec actes), marquer absent ou reporter à demain**.
- Ces actions vont dans une **file chiffrée** et sont rejouées au retour du réseau
  (`POST /api/hors-ligne/sync`). **Jamais d'écrasement silencieux** : chaque opération est
  comparée à l'état du serveur (verrou de ligne) ; si une collègue a modifié le passage
  entre-temps, rien n'est changé, l'état du serveur est affiché avec un message
  (« marquée absente par Magalie… »). Rejouer une opération est sans effet. Les actions
  non envoyées survivent à la déconnexion (sinon un soin validé serait perdu) et sont
  envoyées à la prochaine connexion de la même soignante.

**Notifications push** — *Compte → Notifications* (permission du navigateur demandée par un
clic, choix par type d'événement) : demande de transfert reçue, transmission urgente
(toute l'équipe active sauf l'auteure). Le texte est **figé** (« Nouvelle demande de
transfert à traiter. ») : aucun nom de patient ni contenu médical ; le détail se lit dans
l'appli après connexion. Une notification manquée ne fait jamais échouer l'action.

Configuration : `npm run vapid:generate`, puis `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` dans l'environnement (voir `.env.local.example`).
Sur iPhone, les notifications exigent d'ajouter d'abord l'appli à l'écran d'accueil. Le
service worker n'est actif qu'en production (`npm run build && npm start`).

### Lancer

```bash
npm run dev
```

### Tests et CI

```bash
npm test            # unitaires : dates, validation, chiffrement, fichiers, CSP, CSV, récurrence…
npm run typecheck
npm run lint
```

Les **tests d'intégration** (RLS sur toutes les tables cliniques, garde-fous admin,
audit immuable, limitation de connexion, flux applicatifs) tournent contre un
Postgres réel et sont ignorés si les variables suivantes ne sont pas définies :

```bash
# base migrée + rôle isabelle_app (voir plus haut)
TEST_DATABASE_URL=postgres://isabelle_app:…@localhost:5432/isabelle_test \
TEST_DATABASE_OWNER_URL=postgres://postgres:…@localhost:5432/isabelle_test \
npm test
```

La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue **toutes les migrations
depuis zéro** sur un Postgres de service, crée le rôle applicatif, vérifie qu'il
est conforme, puis exécute lint, typecheck, tests (unitaires + intégration) et build,
à chaque PR et push sur `main`.

### Mode démo (sans base)

Avec `DEMO_MODE=true` en développement (jamais actif en production), si la
base est injoignable, l'appli bascule sur des données fictives et accepte
`isabelle@cabinet-test.local` avec n'importe quel mot de passe.

## Fonctionnement

- **Connexion** : sessions limitées, comptes bloqués temporairement après des échecs
  répétés (voir plus haut).
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
- **Droits** : Isabelle (même règle que `requireAdminId`) exporte toute l'équipe ou une
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
- **Clé de chiffrement** (`DATA_ENCRYPTION_KEY`) : les codes d'accès sont chiffrés
  dans la base, une sauvegarde sans la clé ne les restitue pas. Conserver la clé
  (et les anciennes tant qu'elles servent) dans un gestionnaire de secrets, séparé
  des sauvegardes ; l'inclure dans l'exercice de restauration.

**Restauration**

```bash
createdb isabelle_restore
pg_restore --no-owner --exit-on-error --dbname=isabelle_restore isabelle_AAAAMMJJ….dump
# vérifier : nombre de lignes de visites / patients, RLS active (pg_class.relrowsecurity)
# puis, selon l'hébergeur, rediriger DATABASE_URL ou restaurer dans la base cible
```

Les `GRANT` du rôle applicatif ne sont pas dans l'archive (`--no-privileges`) :
les rejouer après restauration (`psql -f scripts/create-app-role.sql`). **Tester une restauration à blanc régulièrement** ;
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
