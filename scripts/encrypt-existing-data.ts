// Chiffre (ou re-chiffre avec la clé courante) les champs sensibles de
// acces_domicile : codes portail / immeuble, digicode, emplacement de la clé, notes.
//
// À exécuter UNE FOIS après le déploiement du chiffrement, puis après chaque
// rotation de clé (voir README, « Rotation de la clé »). Idempotent : les valeurs
// déjà chiffrées avec la clé courante ne sont pas touchées. Un seul UPDATE par ligne,
// dans une transaction : tout ou rien.
//
// Connexion : DATABASE_URL_OWNER (propriétaire des tables), jamais le rôle de
// l'application. Usage : npm run encrypt:existing   (ajouter --dry-run pour compter sans écrire)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import {
  CHAMPS_ACCES_CHIFFRES,
  aReChiffrer,
  chiffrer,
  contexteAcces,
  dechiffrer,
} from "../src/lib/crypto";

const COLONNES: Record<(typeof CHAMPS_ACCES_CHIFFRES)[number], string> = {
  codePortail: "code_portail",
  codeImmeuble: "code_immeuble",
  digicodePorte: "digicode_porte",
  emplacementCle: "emplacement_cle",
  notesAcces: "notes_acces",
};

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("DATABASE_URL_OWNER n'est pas défini (connexion propriétaire requise).");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const rows = await sql<Record<string, string | null>[]>`select * from acces_domicile`;
    let lignes = 0;
    let valeurs = 0;

    await sql.begin(async (tx) => {
      for (const row of rows) {
        const patientId = row.patient_id as string;
        const maj: Record<string, string | null> = {};
        for (const champ of CHAMPS_ACCES_CHIFFRES) {
          const colonne = COLONNES[champ];
          const valeur = row[colonne] ?? null;
          if (!aReChiffrer(valeur)) continue;
          const contexte = contexteAcces(patientId, champ);
          maj[colonne] = chiffrer(dechiffrer(valeur, contexte), contexte);
          valeurs += 1;
        }
        if (Object.keys(maj).length === 0) continue;
        lignes += 1;
        if (!dryRun) await tx`update acces_domicile set ${tx(maj)} where id = ${row.id as string}`;
      }
    });

    // Aucune valeur affichée : uniquement des effectifs.
    console.log(
      `${dryRun ? "[simulation] " : ""}${valeurs} valeur(s) chiffrée(s) sur ${lignes} ligne(s) (${rows.length} ligne(s) au total).`
    );
  } finally {
    await sql.end();
  }
}

main().catch(() => {
  // Pas de détail : une erreur pourrait citer une valeur.
  console.error("Échec du chiffrement (clé absente ou invalide, base injoignable ?). Aucune modification n'a été validée.");
  process.exit(1);
});
