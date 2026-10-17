import { randomUUID } from "node:crypto";
import postgres from "postgres";

// Tests d'intégration : nécessitent un Postgres migré (migrations/*.sql) et le
// rôle applicatif (scripts/create-app-role.sql).
//   TEST_DATABASE_URL        : rôle applicatif isabelle_app (soumis à la RLS)
//   TEST_DATABASE_OWNER_URL  : propriétaire des tables (pour préparer les données)
// Sans ces variables, les tests d'intégration sont ignorés (voir README).

export const URL_APP = process.env.TEST_DATABASE_URL;
export const URL_OWNER = process.env.TEST_DATABASE_OWNER_URL;
export const integrationActive = Boolean(URL_APP && URL_OWNER);

export function clientApp() {
  return postgres(URL_APP!, { max: 1, prepare: false, onnotice: () => undefined });
}
export function clientOwner() {
  return postgres(URL_OWNER!, { max: 1, prepare: false, onnotice: () => undefined });
}

export type Sql = ReturnType<typeof postgres>;

/** Exécute `fn` dans une transaction où app.current_soignante_id vaut `soignanteId` (ou rien). */
export async function commeSoignante<T>(
  sql: Sql,
  soignanteId: string | null,
  fn: (tx: Sql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    if (soignanteId) await tx`select set_config('app.current_soignante_id', ${soignanteId}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

export type Jeu = {
  admin: string;
  active: string;
  inactive: string;
  expiree: string;
  patient: string;
  visite: string;
  serie: string;
};

/** Jeu de données minimal couvrant toutes les tables cliniques (créé en tant que propriétaire). */
export async function creerJeu(owner: Sql, aujourdhui: string, hier: string): Promise<Jeu> {
  const id = () => randomUUID();
  const sufixe = randomUUID().slice(0, 8);
  const jeu: Jeu = {
    admin: id(),
    active: id(),
    inactive: id(),
    expiree: id(),
    patient: id(),
    visite: id(),
    serie: id(),
  };
  const compte = (uuid: string, nom: string, extra: Record<string, unknown> = {}) => ({
    id: uuid,
    prenom: nom,
    nom: "Test",
    email: `${nom.toLowerCase()}-${sufixe}@test.local`,
    password_hash: "x",
    role: "titulaire",
    ...extra,
  });

  // Le trigger n'autorise la création d'un admin que par un admin (ou tout premier compte) :
  // sur une base de test déjà utilisée, on le suspend le temps de préparer les données.
  await owner`alter table soignantes disable trigger soignantes_garde_admin_insert`;
  await owner`insert into soignantes ${owner(compte(jeu.admin, "Admin", { est_admin: true }))}`;
  await owner`alter table soignantes enable trigger soignantes_garde_admin_insert`;
  await owner`insert into soignantes ${owner(compte(jeu.active, "Active"))}`;
  await owner`insert into soignantes ${owner(compte(jeu.inactive, "Inactive", { actif: false }))}`;
  await owner`insert into soignantes ${owner(compte(jeu.expiree, "Expiree", { role: "remplacante", date_fin: hier }))}`;

  await owner`insert into secteurs (nom) values (${"Secteur " + sufixe})`;
  await owner`insert into patients (id, prenom, nom) values (${jeu.patient}, 'Jeanne', ${"Patient" + sufixe})`;
  await owner`insert into acces_domicile (patient_id, code_portail) values (${jeu.patient}, 'enc:v1:test')`;
  await owner`insert into series_visites (id, patient_id, soignante_id, date_debut, date_fin, frequence, tranches)
    values (${jeu.serie}, ${jeu.patient}, ${jeu.active}, ${aujourdhui}, ${aujourdhui}, 'quotidien', '{8-10}')`;
  await owner`insert into visites (id, patient_id, soignante_id, date, tranche, serie_id)
    values (${jeu.visite}, ${jeu.patient}, ${jeu.active}, ${aujourdhui}, '8-10', ${jeu.serie})`;
  await owner`insert into transmissions (patient_id, soignante_id, contenu) values (${jeu.patient}, ${jeu.active}, 'test')`;
  await owner`insert into ordonnances (patient_id) values (${jeu.patient})`;
  await owner`insert into documents (patient_id, soignante_id, type, fichier_key) values (${jeu.patient}, ${jeu.active}, 'photo', ${"documents/x/" + sufixe + ".jpg"})`;
  await owner`insert into traitements (patient_id, libelle) values (${jeu.patient}, 'test')`;
  await owner`insert into visites_historique (visite_id, soignante_id, champ, nouvelle_valeur) values (${jeu.visite}, ${jeu.active}, 'statut', 'faite')`;
  await owner`insert into transferts (patient_id, de_soignante_id, vers_soignante_id) values (${jeu.patient}, ${jeu.active}, ${jeu.admin})`;
  await owner`insert into audit_log (soignante_id, action, entite) values (${jeu.active}, 'patient_consulte', 'patient')`;
  return jeu;
}

export const TABLES_CLINIQUES = [
  "soignantes",
  "secteurs",
  "patients",
  "acces_domicile",
  "visites",
  "series_visites",
  "visites_historique",
  "transmissions",
  "ordonnances",
  "documents",
  "traitements",
  "transferts",
  "audit_log",
] as const;
