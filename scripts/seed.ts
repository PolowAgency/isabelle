// Peuple la base avec des données fictives réalistes : 60 patients sur 5
// secteurs, 4 semaines de tournées (alternance matin seul / matin + soir),
// transmissions non lues, ordonnances proches de l'expiration, quelques
// visites « absent ». AUCUNE donnée réelle ne doit jamais transiter par ce
// script — voir la contrainte DEMO_MODE dans le prompt d'origine.
//
// Réinitialise les données patients à chaque exécution (jamais les comptes
// soignantes créés par bootstrap-team.ts) : relançable sans accumulation.
//
// Usage : npm run seed

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/schema";
import { trancheParDefaut } from "../src/lib/tranches";

type StatutVisite = "prevue" | "faite" | "absent" | "reportee" | "annulee";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql, { schema });

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function weightedChoice<T>(options: [T, number][]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of options) {
    if (r < weight) return value;
    r -= weight;
  }
  return options[options.length - 1][0];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    result.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);
  }
  return result;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chunkedInsert(table: any, rows: Record<string, unknown>[], size = 400): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

// ---------------------------------------------------------------------
// Données de référence (fictives)
// ---------------------------------------------------------------------

const PRENOMS = [
  "Jacqueline", "Robert", "Monique", "Bernard", "Colette", "Michel", "Odette",
  "Gérard", "Yvette", "André", "Simone", "Roger", "Denise", "Henri", "Paulette",
  "Jean", "Suzanne", "Louis", "Georgette", "Marcel", "Ginette", "Raymond",
  "Madeleine", "Alain", "Renée", "Daniel", "Claude", "Huguette", "Pierre",
  "Nicole", "François", "Christiane", "Jacques", "Annie", "Guy", "Josette",
  "Maurice", "Françoise", "Serge", "Liliane", "Patrick", "Martine", "Didier",
  "Chantal", "Bruno", "Sylvie", "Éric", "Véronique", "Philippe", "Isabelle",
  "Thierry",
];

const NOMS = [
  "Petit", "Moreau", "Lefebvre", "Girard", "Bonnet", "Dupont", "Lambert",
  "Fontaine", "Rousseau", "Vincent", "Muller", "Faure", "Blanc", "Guerin",
  "Boyer", "Garnier", "Chevalier", "François", "Legrand", "Gauthier", "Perrin",
  "Robin", "Clement", "Morin", "Nicolas", "Henry", "Roussel", "Mathieu",
  "Gautier", "Masson", "Marchand", "Duval", "Denis", "Dumont", "Marie",
  "Lemaire", "Noel", "Meyer", "Dufour", "Meunier", "Brun", "Blanchard",
  "Giraud", "Joly", "Riviere", "Lucas", "Brunet", "Gaillard", "Barbier",
  "Arnaud",
];

const RUES = [
  "rue des Lilas", "rue de la Paix", "rue du Marché", "avenue de la République",
  "rue des Tilleuls", "impasse des Roses", "rue Victor Hugo", "rue de l'Église",
  "quai des Peupliers", "rue du Moulin", "allée des Vignes", "rue des Acacias",
  "place du Général de Gaulle", "rue des Écoles", "chemin des Vignes",
  "rue de la Gare", "boulevard des Platanes", "rue du Stade",
];

const SECTEURS = [
  { nom: "Centre", couleur: "#a9c4ab" },
  { nom: "Les Tilleuls", couleur: "#c4b9a9" },
  { nom: "Bord de Loire", couleur: "#a9b7c4" },
  { nom: "Hauteville", couleur: "#c4a9bb" },
  { nom: "La Gare", couleur: "#b9c4a9" },
];

const LIENS_URGENCE = ["Fille", "Fils", "Épouse", "Époux", "Voisine", "Neveu", "Nièce", "Sœur"];

const MEDECINS = [
  "Dr Lechat", "Dr Berthier", "Dr Solignac", "Dr Nguyen", "Dr Perret",
  "Dr Amrani", "Dr Fabre", "Dr Colin",
];

const ACTES = ["pansement", "injection", "prise de sang", "toilette", "perfusion", "surveillance", "autre"] as const;

const EMPLACEMENTS_CLE = [
  "Boîte à clé, code 4471", "Sous le pot de fleurs à droite de la porte",
  "Chez la voisine du 2e (Mme Roussel)", "Toujours présent(e), sonner",
  "Gardien de l'immeuble", null, null,
];

const STATIONNEMENTS = [
  "Parking résidence, badge nécessaire", "Stationnement facile dans la rue",
  "Zone bleue - disque obligatoire", "Cour intérieure, portail code 25B",
  null, null,
];

const ANIMAUX = [
  "Chat, aucun souci", "Chien (Rex), gentil mais aboie fort — prévenir avant d'entrer",
  "Deux chats, un peu craintifs", "Chien tenu en laisse par l'aidant à l'arrivée",
];

const AIDANTS = [
  "Fille présente tous les matins vers 9h", "Aide à domicile lundi/mercredi/vendredi 8h-10h",
  "Époux présent en permanence", "Voisine passe vérifier en fin de journée",
  "Fils présent le week-end uniquement",
];

const TRANSMISSIONS_INFO = [
  "Pansement refait, plaie en bonne évolution.",
  "RAS, patient(e) en forme ce matin.",
  "Toilette faite, a bien mangé.",
  "Constantes prises : TA 13/8, pouls régulier.",
  "A pris son traitement sous surveillance.",
  "Bonne journée, moral au beau fixe.",
  "Perfusion posée sans difficulté.",
];

const TRANSMISSIONS_ATTENTION = [
  "Patient un peu confus ce matin, à surveiller.",
  "Légère rougeur autour du pansement, à surveiller demain.",
  "A peu mangé aujourd'hui, en parler à la famille.",
  "Glycémie un peu haute (2.1g/L), à recontrôler.",
  "Fatigue inhabituelle signalée, rester attentif.",
  "Petite chute sans gravité ce matin, RAS après contrôle.",
];

const TRANSMISSIONS_URGENT = [
  "Glycémie élevée (2.9g/L), médecin traitant prévenu.",
  "Plaie talon droit : rougeur qui inquiète, prévenir médecin si pas d'amélioration.",
  "Tension très basse (9/5), à recontrôler en urgence demain matin.",
  "Absent(e) au domicile sans prévenir, à recontacter rapidement.",
  "Douleur thoracique signalée, famille prévenue, orientée vers médecin.",
];

const DESCRIPTIONS_ORDONNANCE = [
  "Pansements + surveillance de plaie", "Injections anticoagulantes",
  "Toilette + prévention d'escarres", "Prise de sang de contrôle",
  "Perfusion antibiotique", "Surveillance glycémique + injections insuline",
];

const LIBELLES_TRAITEMENT = [
  "Doliprane", "Kardégic", "Lasilix", "Lévothyrox", "Metformine", "Amlodipine",
  "Insuline Lantus", "Xarelto", "Ventoline", "Pantoprazole",
];

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  console.log("Vérification des comptes soignantes…");
  const soignantesRows = await db
    .select({ id: schema.soignantes.id, prenom: schema.soignantes.prenom })
    .from(schema.soignantes)
    .where(eq(schema.soignantes.actif, true));

  if (soignantesRows.length === 0) {
    console.error(
      "Aucune soignante trouvée. Lance d'abord: npm run bootstrap:team"
    );
    process.exit(1);
  }
  console.log(`  ${soignantesRows.length} soignante(s) active(s) trouvée(s).`);

  console.log("Réinitialisation des données patients (secteurs, visites, transmissions…)…");
  await db.delete(schema.transmissions);
  await db.delete(schema.documents);
  await db.delete(schema.visites);
  await db.delete(schema.traitements);
  await db.delete(schema.ordonnances);
  await db.delete(schema.accesDomicile);
  await db.delete(schema.patients);
  await db.delete(schema.secteurs);

  console.log("Création des secteurs…");
  const secteurRows = await db
    .insert(schema.secteurs)
    .values(SECTEURS.map((s, i) => ({ nom: s.nom, ordre: i + 1, couleur: s.couleur })))
    .returning();

  const today = new Date();
  const usedNames = new Set<string>();

  type PatientPlan = {
    id: string;
    secteurId: string;
    secteurIndex: number;
    actif: boolean;
    profil: "matin" | "matin_soir" | "matin_midi_soir";
  };

  console.log("Création de 60 patients fictifs…");
  const patientsToInsert: (typeof schema.patients.$inferInsert)[] = [];
  const patientMeta: { secteurIndex: number; actif: boolean; profil: PatientPlan["profil"] }[] = [];

  for (let i = 0; i < 60; i++) {
    let prenom = randomChoice(PRENOMS);
    let nom = randomChoice(NOMS);
    while (usedNames.has(`${prenom} ${nom}`)) {
      prenom = randomChoice(PRENOMS);
      nom = randomChoice(NOMS);
    }
    usedNames.add(`${prenom} ${nom}`);

    const secteurIndex = i % SECTEURS.length;
    const secteur = secteurRows[secteurIndex];

    const age = randomInt(0, 100) < 15 ? randomInt(34, 62) : randomInt(66, 96);
    const naissance = addDays(today, -age * 365 - randomInt(0, 364));

    const actif = i >= 55 ? false : true; // 5 patients inactifs (fin de suivi)
    const profil = weightedChoice<PatientPlan["profil"]>([
      ["matin", 65],
      ["matin_soir", 25],
      ["matin_midi_soir", 10],
    ]);

    patientMeta.push({ secteurIndex, actif, profil });

    const lienUrgence = randomChoice(LIENS_URGENCE);
    patientsToInsert.push({
      prenom,
      nom,
      dateNaissance: isoDate(naissance),
      telephone: `0${randomChoice([6, 7])} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
      adresse: `${randomInt(1, 145)} ${randomChoice(RUES)}`,
      complementAdresse:
        Math.random() < 0.4
          ? randomChoice([`Appt ${randomInt(1, 40)}, ${randomInt(1, 5)}e étage`, `Résidence Les Cerisiers, bât ${randomChoice(["A", "B", "C"])}`, "Maison individuelle"])
          : null,
      codePostal: "37270",
      ville: "Verchamps",
      secteurId: secteur.id,
      actif,
      contactUrgenceNom: `${randomChoice(PRENOMS)} ${nom} (${lienUrgence.toLowerCase()})`,
      contactUrgenceTelephone: `0${randomChoice([6, 7])} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
      contactUrgenceLien: lienUrgence,
      medecinTraitantNom: randomChoice(MEDECINS),
      medecinTraitantTelephone: `02 ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
    });
  }

  const patientRows = await db.insert(schema.patients).values(patientsToInsert).returning();

  const plans: PatientPlan[] = patientRows.map((p, i) => ({
    id: p.id,
    secteurId: p.secteurId!,
    secteurIndex: patientMeta[i].secteurIndex,
    actif: patientMeta[i].actif,
    profil: patientMeta[i].profil,
  }));

  console.log("Création des infos d'accès domicile…");
  await chunkedInsert(
    schema.accesDomicile,
    patientRows.map((p) => ({
      patientId: p.id,
      codePortail: Math.random() < 0.5 ? `${randomInt(1000, 9999)}${randomChoice(["A", "B", ""])}` : null,
      codeImmeuble: Math.random() < 0.3 ? `${randomInt(1000, 9999)}` : null,
      etage: Math.random() < 0.6 ? randomChoice(["RDC", "1er étage", "2e étage", "3e étage", "4e étage"]) : null,
      digicodePorte: Math.random() < 0.2 ? `${randomInt(10, 99)}${randomChoice(["A", "B"])}` : null,
      emplacementCle: randomChoice(EMPLACEMENTS_CLE),
      presenceAnimal: Math.random() < 0.3,
      descriptionAnimal: Math.random() < 0.3 ? randomChoice(ANIMAUX) : null,
      presenceAidant: Math.random() < 0.45,
      detailsAidant: Math.random() < 0.45 ? randomChoice(AIDANTS) : null,
      stationnement: randomChoice(STATIONNEMENTS),
      notesAcces: Math.random() < 0.15 ? "Sonner deux fois, sonnette peu audible." : null,
    }))
  );

  console.log("Création des traitements…");
  const traitementsToInsert: (typeof schema.traitements.$inferInsert)[] = [];
  for (const plan of plans) {
    if (!plan.actif || Math.random() < 0.25) continue;
    const passages =
      plan.profil === "matin"
        ? ["matin"]
        : plan.profil === "matin_soir"
        ? ["matin", "soir"]
        : ["matin", "midi", "soir"];
    const n = randomInt(1, 3);
    for (let i = 0; i < n; i++) {
      traitementsToInsert.push({
        patientId: plan.id,
        libelle: randomChoice(LIBELLES_TRAITEMENT),
        dosage: randomChoice(["1 cp", "1/2 cp", "10mg", "20mg", "1 injection", "500mg"]),
        passages,
        actif: true,
        notes: Math.random() < 0.15 ? "À jeun de préférence." : null,
      });
    }
  }
  await chunkedInsert(schema.traitements, traitementsToInsert);

  console.log("Création des ordonnances (dont certaines proches de l'expiration)…");
  const ordonnancesToInsert: (typeof schema.ordonnances.$inferInsert)[] = [];
  const expirantSoonIndexes = new Set(pickN(plans.map((_, i) => i).filter((i) => plans[i].actif), 10));
  const expireesIndexes = new Set(
    pickN(plans.map((_, i) => i).filter((i) => plans[i].actif && !expirantSoonIndexes.has(i)), 3)
  );

  plans.forEach((plan, i) => {
    const nOrdonnances = randomInt(1, 2);
    for (let k = 0; k < nOrdonnances; k++) {
      let dateFin: Date;
      if (expirantSoonIndexes.has(i) && k === 0) {
        dateFin = addDays(today, randomInt(2, 14));
      } else if (expireesIndexes.has(i) && k === 0) {
        dateFin = addDays(today, -randomInt(2, 20));
      } else {
        dateFin = addDays(today, randomInt(35, 200));
      }
      const duree = randomInt(30, 90);
      const dateDebut = addDays(dateFin, -duree);
      const datePrescription = addDays(dateDebut, -randomInt(0, 3));

      ordonnancesToInsert.push({
        patientId: plan.id,
        prescripteur: randomChoice(MEDECINS),
        datePrescription: isoDate(datePrescription),
        dateDebut: isoDate(dateDebut),
        dateFin: isoDate(dateFin),
        description: randomChoice(DESCRIPTIONS_ORDONNANCE),
        fichierKey: null,
        active: plan.actif && k === 0,
      });
    }
  });
  await chunkedInsert(schema.ordonnances, ordonnancesToInsert);

  // -----------------------------------------------------------------
  // Visites — 4 semaines, alternance matin seul / matin + soir
  // -----------------------------------------------------------------
  console.log("Génération de 4 semaines de tournées…");

  const semaine0 = mondayOf(addDays(today, -7)); // semaine -1
  const weekTypes: ("matin" | "matin_soir")[] = ["matin", "matin_soir", "matin", "matin_soir"];

  const activePlans = plans.filter((p) => p.actif);
  // Ordre stable au sein d'un secteur (façon "route" de tournée)
  const ordreParSecteur = new Map<number, string[]>();
  for (const plan of activePlans) {
    const list = ordreParSecteur.get(plan.secteurIndex) ?? [];
    list.push(plan.id);
    ordreParSecteur.set(plan.secteurIndex, list);
  }
  const ordreIndex = new Map<string, number>();
  ordreParSecteur.forEach((ids) => {
    ids.forEach((id, idx) => ordreIndex.set(id, idx));
  });

  const soignanteIdBySecteur = (secteurIndex: number) =>
    soignantesRows[secteurIndex % soignantesRows.length].id;

  const todayIso = isoDate(today);
  const yesterdayIso = isoDate(addDays(today, -1));

  function actesEtDuree() {
    const n = randomInt(1, 3);
    const actes = pickN([...ACTES], n);
    const duree = actes.length * randomInt(10, 18);
    return { actes, duree };
  }

  function heureReelle(date: Date, passage: "matin" | "midi" | "soir"): Date {
    const hour = passage === "matin" ? randomInt(7, 11) : passage === "midi" ? randomInt(11, 14) : randomInt(17, 20);
    const d = new Date(date);
    d.setHours(hour, randomInt(0, 59), 0, 0);
    return d;
  }

  const visitesToInsert: (typeof schema.visites.$inferInsert)[] = [];

  for (let w = 0; w < 4; w++) {
    const weekType = weekTypes[w];
    const monday = addDays(semaine0, w * 7);

    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      const dateIso = isoDate(date);
      const isFuture = dateIso > todayIso;
      const isToday = dateIso === todayIso;
      const isYesterday = dateIso === yesterdayIso;

      for (const plan of activePlans) {
        const passages: ("matin" | "midi" | "soir")[] =
          weekType === "matin"
            ? ["matin"]
            : plan.profil === "matin"
            ? ["matin"]
            : plan.profil === "matin_soir"
            ? ["matin", "soir"]
            : ["matin", "midi", "soir"];

        for (const passage of passages) {
          const { actes, duree } = actesEtDuree();

          let statut: StatutVisite;
          let heureReelleVal: Date | null = null;

          if (isFuture) {
            statut = "prevue";
          } else if (isToday) {
            statut = weightedChoice<StatutVisite>([
              ["faite", 40],
              ["prevue", 55],
              ["absent", 5],
            ]);
            if (statut === "faite") heureReelleVal = heureReelle(date, passage);
          } else if (isYesterday) {
            statut = weightedChoice<StatutVisite>([
              ["faite", 82],
              ["prevue", 10],
              ["absent", 5],
              ["reportee", 3],
            ]);
            if (statut === "faite") heureReelleVal = heureReelle(date, passage);
          } else {
            statut = weightedChoice<StatutVisite>([
              ["faite", 90],
              ["absent", 5],
              ["reportee", 3],
              ["annulee", 2],
            ]);
            if (statut === "faite") heureReelleVal = heureReelle(date, passage);
          }

          visitesToInsert.push({
            patientId: plan.id,
            soignanteId: soignanteIdBySecteur(plan.secteurIndex),
            date: dateIso,
            tranche: trancheParDefaut(passage),
            ordreDansPassage: ordreIndex.get(plan.id) ?? 0,
            actes,
            dureeEstimeeMin: duree,
            statut,
            heureReelle: heureReelleVal,
          });
        }
      }
    }
  }

  console.log(`  ${visitesToInsert.length} visites à insérer…`);
  const insertedVisites = await (async () => {
    const rows: (typeof schema.visites.$inferSelect)[] = [];
    for (let i = 0; i < visitesToInsert.length; i += 400) {
      const batch = await db
        .insert(schema.visites)
        .values(visitesToInsert.slice(i, i + 400))
        .returning();
      rows.push(...batch);
    }
    return rows;
  })();

  // -----------------------------------------------------------------
  // Transmissions — dont certaines urgentes non lues
  // -----------------------------------------------------------------
  console.log("Création des transmissions (dont non lues)…");

  const visitesByPatient = new Map<string, (typeof insertedVisites)>();
  for (const v of insertedVisites) {
    const list = visitesByPatient.get(v.patientId) ?? [];
    list.push(v);
    visitesByPatient.set(v.patientId, list);
  }

  const transmissionsToInsert: (typeof schema.transmissions.$inferInsert)[] = [];
  const soignanteIds = soignantesRows.map((s) => s.id);

  for (const plan of activePlans) {
    const nTransmissions = randomInt(2, 4);
    const patientVisites = (visitesByPatient.get(plan.id) ?? []).filter((v) => v.statut === "faite");

    for (let i = 0; i < nTransmissions; i++) {
      const importance = weightedChoice<"info" | "attention" | "urgent">([
        ["info", 70],
        ["attention", 22],
        ["urgent", 8],
      ]);
      const contenu =
        importance === "urgent"
          ? randomChoice(TRANSMISSIONS_URGENT)
          : importance === "attention"
          ? randomChoice(TRANSMISSIONS_ATTENTION)
          : randomChoice(TRANSMISSIONS_INFO);

      const liee = patientVisites.length > 0 && Math.random() < 0.7 ? randomChoice(patientVisites) : null;
      const auteur = liee ? liee.soignanteId : soignanteIdBySecteur(plan.secteurIndex);

      const nonLue = importance === "urgent" ? Math.random() < 0.6 : Math.random() < 0.2;
      const luePar = nonLue ? [] : pickN(soignanteIds, randomInt(1, soignanteIds.length));

      transmissionsToInsert.push({
        patientId: plan.id,
        visiteId: liee ? liee.id : null,
        soignanteId: auteur,
        contenu,
        importance,
        luePar,
      });
    }
  }

  // Garantit quelques urgentes non lues récentes pour l'écran Alertes.
  const recentUrgentTargets = pickN(activePlans, 5);
  for (const plan of recentUrgentTargets) {
    transmissionsToInsert.push({
      patientId: plan.id,
      visiteId: null,
      soignanteId: soignanteIdBySecteur(plan.secteurIndex),
      contenu: randomChoice(TRANSMISSIONS_URGENT),
      importance: "urgent",
      luePar: [],
    });
  }

  await chunkedInsert(schema.transmissions, transmissionsToInsert);

  console.log("\nRécapitulatif :");
  console.log(`  Secteurs        : ${secteurRows.length}`);
  console.log(`  Patients        : ${patientRows.length} (dont ${patientRows.length - 55} inactifs)`);
  console.log(`  Traitements     : ${traitementsToInsert.length}`);
  console.log(`  Ordonnances     : ${ordonnancesToInsert.length} (dont ${expirantSoonIndexes.size} proches de l'expiration, ${expireesIndexes.size} expirées)`);
  console.log(`  Visites         : ${insertedVisites.length}`);
  console.log(`  Transmissions   : ${transmissionsToInsert.length}`);
  console.log("\nSeed terminé.");

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
