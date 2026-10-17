import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Chiffrement applicatif (AES-256-GCM) des champs sensibles — codes d'accès au
// domicile des patients. La clé vit dans l'environnement (DATA_ENCRYPTION_KEY),
// jamais en base : une fuite de la base seule ne révèle pas les codes.
//
// Format stocké : enc:v1:<empreinte de clé>:<iv>:<tag>:<texte chiffré>
//   - v1 : version du format (évolutions futures) ;
//   - empreinte de clé : identifie la clé utilisée → rotation sans interruption
//     (anciennes clés dans DATA_ENCRYPTION_KEY_PREVIOUS, voir README) ;
//   - le « contexte » (table, ligne, champ) est authentifié (AAD) : un texte
//     chiffré recopié dans une autre ligne ou un autre champ ne se déchiffre pas.
// Une valeur sans préfixe est lue telle quelle (données antérieures au chiffrement,
// en attendant scripts/encrypt-existing-data.ts).

const PREFIXE = "enc:v1:";

function lireCle(valeur: string): Buffer {
  const cle = Buffer.from(valeur.trim(), "base64");
  if (cle.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY invalide : 32 octets encodés en base64 attendus (openssl rand -base64 32).");
  }
  return cle;
}

function empreinte(cle: Buffer): string {
  return createHash("sha256").update(cle).digest("hex").slice(0, 8);
}

function clesDisponibles(): { courante: Buffer; toutes: Map<string, Buffer> } {
  const brute = process.env.DATA_ENCRYPTION_KEY;
  if (!brute) {
    throw new Error("DATA_ENCRYPTION_KEY n'est pas défini : impossible de chiffrer ou déchiffrer les codes d'accès.");
  }
  const courante = lireCle(brute);
  const toutes = new Map<string, Buffer>([[empreinte(courante), courante]]);
  for (const ancienne of (process.env.DATA_ENCRYPTION_KEY_PREVIOUS ?? "").split(",")) {
    if (ancienne.trim()) {
      const cle = lireCle(ancienne);
      toutes.set(empreinte(cle), cle);
    }
  }
  return { courante, toutes };
}

export function estChiffre(valeur: string | null | undefined): boolean {
  return typeof valeur === "string" && valeur.startsWith(PREFIXE);
}

export function chiffrer(clair: string | null | undefined, contexte: string): string | null {
  if (clair === null || clair === undefined || clair === "") return null;
  const { courante } = clesDisponibles();
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", courante, iv);
  chiffreur.setAAD(Buffer.from(contexte, "utf8"));
  const contenu = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return [
    `${PREFIXE}${empreinte(courante)}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    contenu.toString("base64url"),
  ].join(":");
}

export function dechiffrer(valeur: string | null | undefined, contexte: string): string | null {
  if (valeur === null || valeur === undefined) return null;
  if (!estChiffre(valeur)) return valeur; // donnée historique non chiffrée

  const [, , idCle, iv, tag, contenu] = valeur.split(":");
  const { toutes } = clesDisponibles();
  const cle = toutes.get(idCle);
  // Messages volontairement génériques : jamais de valeur, de clé ni de contexte.
  if (!cle || !iv || !tag || !contenu) throw new Error("Donnée chiffrée illisible.");

  try {
    const dechiffreur = createDecipheriv("aes-256-gcm", cle, Buffer.from(iv, "base64url"));
    dechiffreur.setAAD(Buffer.from(contexte, "utf8"));
    dechiffreur.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      dechiffreur.update(Buffer.from(contenu, "base64url")),
      dechiffreur.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Donnée chiffrée illisible.");
  }
}

/** Vrai si la valeur est en clair ou chiffrée avec une autre clé que la clé courante. */
export function aReChiffrer(valeur: string | null | undefined): boolean {
  if (!valeur) return false;
  if (!estChiffre(valeur)) return true;
  const { courante } = clesDisponibles();
  return valeur.split(":")[2] !== empreinte(courante);
}

// ---------------------------------------------------------------------------
// Champs chiffrés de acces_domicile
// ---------------------------------------------------------------------------

export const CHAMPS_ACCES_CHIFFRES = [
  "codePortail",
  "codeImmeuble",
  "digicodePorte",
  "emplacementCle",
  "notesAcces",
] as const;
export type ChampAccesChiffre = (typeof CHAMPS_ACCES_CHIFFRES)[number];

export function contexteAcces(patientId: string, champ: ChampAccesChiffre): string {
  return `acces_domicile|${patientId}|${champ}`;
}
