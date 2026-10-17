// Contrôle des fichiers envoyés (ordonnances, photos, documents) :
//  1. détection du vrai format par signature (magic bytes), pas par le type MIME
//     ni l'extension déclarés par le navigateur ;
//  2. suppression des métadonnées des photos (EXIF dont position GPS, XMP, IPTC,
//     commentaires) avant stockage.
// Fonctions pures sur des octets : aucune dépendance native.

export type TypeFichier = {
  mime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  extension: "pdf" | "jpg" | "png" | "webp" | "heic";
  image: boolean;
};

const PDF: TypeFichier = { mime: "application/pdf", extension: "pdf", image: false };
const JPEG: TypeFichier = { mime: "image/jpeg", extension: "jpg", image: true };
const PNG: TypeFichier = { mime: "image/png", extension: "png", image: true };
const WEBP: TypeFichier = { mime: "image/webp", extension: "webp", image: true };
const HEIC: TypeFichier = { mime: "image/heic", extension: "heic", image: true };

const MARQUES_HEIF = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function ascii(octets: Uint8Array, debut: number, fin: number): string {
  let texte = "";
  for (let i = debut; i < fin && i < octets.length; i++) texte += String.fromCharCode(octets[i]);
  return texte;
}

export function detecterType(octets: Uint8Array): TypeFichier | null {
  if (octets.length < 12) return null;
  if (ascii(octets, 0, 5) === "%PDF-") return PDF;
  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return JPEG;
  if (
    octets[0] === 0x89 && octets[1] === 0x50 && octets[2] === 0x4e && octets[3] === 0x47 &&
    octets[4] === 0x0d && octets[5] === 0x0a && octets[6] === 0x1a && octets[7] === 0x0a
  ) {
    return PNG;
  }
  if (ascii(octets, 0, 4) === "RIFF" && ascii(octets, 8, 12) === "WEBP") return WEBP;
  if (ascii(octets, 4, 8) === "ftyp" && MARQUES_HEIF.has(ascii(octets, 8, 12))) return HEIC;
  return null;
}

/** Le type annoncé par le navigateur doit correspondre au contenu réel. */
export function memeFamille(mimeDeclare: string, detecte: TypeFichier): boolean {
  const mime = mimeDeclare.toLowerCase();
  if (detecte === HEIC) return mime === "image/heic" || mime === "image/heif";
  return mime === detecte.mime;
}

// ---------------------------------------------------------------------------
// Suppression des métadonnées
// ---------------------------------------------------------------------------

function concat(morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((somme, m) => somme + m.length, 0);
  const sortie = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    sortie.set(m, position);
    position += m.length;
  }
  return sortie;
}

/** Orientation EXIF (1-8) lue dans un segment APP1 « Exif », ou 1 si absente. */
function lireOrientation(segment: Uint8Array): number {
  // segment = données après la longueur : "Exif\0\0" + TIFF
  if (ascii(segment, 0, 4) !== "Exif") return 1;
  const tiff = segment.subarray(6);
  if (tiff.length < 8) return 1;
  const petit = ascii(tiff, 0, 2) === "II";
  if (!petit && ascii(tiff, 0, 2) !== "MM") return 1;
  const vue = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => vue.getUint16(o, petit);
  const u32 = (o: number) => vue.getUint32(o, petit);
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const nombre = u16(ifd);
  for (let i = 0; i < nombre; i++) {
    const entree = ifd + 2 + i * 12;
    if (entree + 12 > tiff.length) return 1;
    if (u16(entree) === 0x0112) {
      const valeur = u16(entree + 8);
      return valeur >= 1 && valeur <= 8 ? valeur : 1;
    }
  }
  return 1;
}

/** APP1 minimal ne contenant que l'orientation (sinon une photo prise en portrait s'afficherait couchée). */
function segmentOrientation(orientation: number): Uint8Array {
  const donnees = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF little-endian, IFD en 8
    0x01, 0x00, // 1 entrée
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // pas d'autre IFD
  ]);
  const longueur = donnees.length + 2;
  return concat([new Uint8Array([0xff, 0xe1, longueur >> 8, longueur & 0xff]), donnees]);
}

function nettoyerJpeg(octets: Uint8Array): Uint8Array {
  const sortie: Uint8Array[] = [octets.subarray(0, 2)]; // SOI
  let position = 2;
  let orientation = 1;
  let orientationInseree = false;

  while (position + 4 <= octets.length) {
    if (octets[position] !== 0xff) throw new Error("JPEG invalide");
    const marqueur = octets[position + 1];
    if (marqueur === 0xff) {
      position += 1; // octet de bourrage
      continue;
    }
    // Début des données image : tout le reste est conservé tel quel.
    if (marqueur === 0xda) {
      sortie.push(octets.subarray(position));
      position = octets.length;
      break;
    }
    // Marqueurs sans longueur.
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
      sortie.push(octets.subarray(position, position + 2));
      position += 2;
      continue;
    }
    const longueur = (octets[position + 2] << 8) | octets[position + 3];
    const fin = position + 2 + longueur;
    if (longueur < 2 || fin > octets.length) throw new Error("JPEG invalide");
    const segment = octets.subarray(position, fin);

    // APP1 (EXIF / XMP), APP13 (IPTC / Photoshop), COM (commentaire) : supprimés.
    if (marqueur === 0xe1) {
      orientation = Math.max(orientation, lireOrientation(octets.subarray(position + 4, fin)));
    } else if (marqueur !== 0xed && marqueur !== 0xfe) {
      sortie.push(segment);
      // L'orientation (si ≠ 1) est réinsérée juste après le premier segment JFIF/APPn.
    }
    position = fin;
  }

  if (position < octets.length) sortie.push(octets.subarray(position));
  const resultat = concat(sortie);

  if (orientation > 1 && !orientationInseree) {
    orientationInseree = true;
    // Insertion juste après SOI (et avant les autres segments : valide pour EXIF).
    return concat([resultat.subarray(0, 2), segmentOrientation(orientation), resultat.subarray(2)]);
  }
  return resultat;
}

const CHUNKS_PNG_METADONNEES = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function nettoyerPng(octets: Uint8Array): Uint8Array {
  const sortie: Uint8Array[] = [octets.subarray(0, 8)];
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let position = 8;
  while (position + 12 <= octets.length) {
    const longueur = vue.getUint32(position);
    const type = ascii(octets, position + 4, position + 8);
    const fin = position + 12 + longueur;
    if (fin > octets.length) throw new Error("PNG invalide");
    if (!CHUNKS_PNG_METADONNEES.has(type)) sortie.push(octets.subarray(position, fin));
    position = fin;
    if (type === "IEND") break;
  }
  return concat(sortie);
}

function nettoyerWebp(octets: Uint8Array): Uint8Array {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const sortie: Uint8Array[] = [];
  let position = 12;
  while (position + 8 <= octets.length) {
    const type = ascii(octets, position, position + 4);
    const taille = vue.getUint32(position + 4, true);
    const fin = position + 8 + taille + (taille % 2);
    if (fin > octets.length + 1) throw new Error("WebP invalide");
    const morceau = octets.slice(position, Math.min(fin, octets.length));
    if (type === "VP8X") {
      morceau[8] &= ~(0x08 | 0x04); // plus de EXIF ni de XMP annoncés
      sortie.push(morceau);
    } else if (type !== "EXIF" && type !== "XMP ") {
      sortie.push(morceau);
    }
    position = fin;
  }
  const corps = concat(sortie);
  const entete = new Uint8Array(12);
  entete.set(octets.subarray(0, 12));
  new DataView(entete.buffer).setUint32(4, corps.length + 4, true);
  return concat([entete, corps]);
}

/**
 * Renvoie le fichier sans métadonnées. PDF : inchangé. HEIC : refusé, car on ne
 * sait pas en retirer la géolocalisation (l'application convertit les photos en
 * JPEG dans le navigateur avant envoi).
 */
export function nettoyerMetadonnees(octets: Uint8Array, type: TypeFichier): Uint8Array {
  if (type === JPEG) return nettoyerJpeg(octets);
  if (type === PNG) return nettoyerPng(octets);
  if (type === WEBP) return nettoyerWebp(octets);
  if (type === HEIC) {
    throw new Error("Les photos HEIC doivent être converties en JPEG avant l'envoi.");
  }
  return octets;
}

export function nomObjet(patientId: string, dossier: string, type: TypeFichier, uuid: string): string {
  // Nom entièrement généré côté serveur : l'extension vient du format détecté,
  // jamais du nom de fichier fourni par l'utilisateur.
  return `${dossier}/${patientId}/${uuid}.${type.extension}`;
}
