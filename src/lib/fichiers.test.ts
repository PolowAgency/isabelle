import { describe, expect, test } from "vitest";
import { detecterType, memeFamille, nettoyerMetadonnees, nomObjet } from "./fichiers";

const octets = (...valeurs: number[]) => new Uint8Array(valeurs);
const texte = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const remplir = (tete: number[], total = 64) => {
  const o = new Uint8Array(total);
  o.set(tete);
  return o;
};

function jpegAvecExif(orientation: number): Uint8Array {
  const exif = [
    ...texte("Exif"), 0, 0,
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    2, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, // orientation
    0x25, 0x88, 4, 0, 1, 0, 0, 0, 0x1a, 0, 0, 0, // pointeur GPS (marqueur de position)
    0, 0, 0, 0,
    ...texte("GPS-SECRET-48.85N"),
  ];
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif];
  const jfif = [0xff, 0xe0, 0, 16, ...texte("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const commentaire = [0xff, 0xfe, 0, 2 + 7, ...texte("secret!")];
  const iptc = [0xff, 0xed, 0, 2 + 5, ...texte("IPTC!")];
  const scan = [0xff, 0xda, 0, 4, 1, 2, 0xaa, 0xbb, 0xcc, 0xff, 0xd9];
  return octets(0xff, 0xd8, ...jfif, ...app1, ...commentaire, ...iptc, ...scan);
}

const contient = (haystack: Uint8Array, aiguille: string) =>
  Buffer.from(haystack).includes(Buffer.from(aiguille));

describe("détection du type réel", () => {
  test("signatures reconnues", () => {
    expect(detecterType(remplir(texte("%PDF-1.7")))?.mime).toBe("application/pdf");
    expect(detecterType(remplir([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detecterType(remplir([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(detecterType(remplir([...texte("RIFF"), 0, 0, 0, 0, ...texte("WEBP")]))?.mime).toBe("image/webp");
    expect(detecterType(remplir([0, 0, 0, 24, ...texte("ftypheic")]))?.mime).toBe("image/heic");
  });

  test("contenu qui ne correspond à rien : refusé", () => {
    expect(detecterType(remplir(texte("<?php system($_GET['x']); ?>")))).toBeNull();
    expect(detecterType(remplir(texte("MZ\x90\x00")))).toBeNull(); // exécutable Windows
    expect(detecterType(octets(1, 2, 3))).toBeNull();
    expect(detecterType(new Uint8Array(0))).toBeNull();
  });

  test("type MIME déclaré incohérent avec le contenu", () => {
    const pdf = detecterType(remplir(texte("%PDF-1.7")))!;
    expect(memeFamille("application/pdf", pdf)).toBe(true);
    expect(memeFamille("image/jpeg", pdf)).toBe(false);
    const heic = detecterType(remplir([0, 0, 0, 24, ...texte("ftypheic")]))!;
    expect(memeFamille("image/heif", heic)).toBe(true);
    expect(memeFamille("image/png", heic)).toBe(false);
  });
});

describe("suppression des métadonnées", () => {
  test("JPEG : EXIF/GPS, IPTC et commentaire supprimés, image intacte", () => {
    const source = jpegAvecExif(1);
    expect(contient(source, "GPS-SECRET")).toBe(true);
    const net = nettoyerMetadonnees(source, detecterType(source)!);
    expect(contient(net, "GPS-SECRET")).toBe(false);
    expect(contient(net, "secret!")).toBe(false);
    expect(contient(net, "IPTC!")).toBe(false);
    expect(contient(net, "JFIF")).toBe(true);
    expect(Array.from(net.slice(-5))).toEqual([0xaa, 0xbb, 0xcc, 0xff, 0xd9]);
    expect(detecterType(net)?.mime).toBe("image/jpeg");
  });

  test("JPEG : l'orientation est conservée (sans quoi la photo s'afficherait couchée), le reste non", () => {
    const net = nettoyerMetadonnees(jpegAvecExif(6), detecterType(jpegAvecExif(6))!);
    expect(contient(net, "GPS-SECRET")).toBe(false);
    expect(contient(net, "Exif")).toBe(true);
    // Relecture : l'orientation 6 est bien présente dans le segment minimal.
    const buf = Buffer.from(net);
    const i = buf.indexOf(Buffer.from([0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00]));
    expect(buf[i + 8]).toBe(6);
  });

  test("JPEG tronqué ou invalide : erreur plutôt que fichier non nettoyé", () => {
    const casse = octets(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3, 4, 5, 6);
    expect(() => nettoyerMetadonnees(casse, detecterType(remplir(Array.from(casse)))!)).toThrow();
  });

  test("PNG : chunks texte / EXIF / date supprimés", () => {
    const chunk = (type: string, donnees: number[]) => [
      0, 0, 0, donnees.length, ...texte(type), ...donnees, 0, 0, 0, 0,
    ];
    const png = octets(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
      ...chunk("eXIf", texte("GPS-SECRET")),
      ...chunk("tEXt", texte("Comment\0secret")),
      ...chunk("IDAT", [1, 2, 3]),
      ...chunk("IEND", [])
    );
    const net = nettoyerMetadonnees(png, detecterType(png)!);
    expect(contient(net, "GPS-SECRET")).toBe(false);
    expect(contient(net, "secret")).toBe(false);
    expect(contient(net, "IHDR")).toBe(true);
    expect(contient(net, "IDAT")).toBe(true);
    expect(contient(net, "IEND")).toBe(true);
  });

  test("WebP : EXIF et XMP supprimés, taille RIFF recalculée, indicateurs VP8X effacés", () => {
    const chunk = (type: string, donnees: number[]) => {
      const pad = donnees.length % 2 ? [0] : [];
      return [...texte(type), donnees.length & 0xff, 0, 0, 0, ...donnees, ...pad];
    };
    const vp8x = chunk("VP8X", [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // ICC + EXIF + XMP annoncés
    const corps = [
      ...texte("WEBP"),
      ...vp8x,
      ...chunk("EXIF", texte("GPS-SECRET")),
      ...chunk("XMP ", texte("xmp-secret")),
      ...chunk("VP8 ", [1, 2, 3, 4]),
    ];
    const webp = octets(...texte("RIFF"), corps.length, 0, 0, 0, ...corps);
    const net = nettoyerMetadonnees(webp, detecterType(webp)!);
    expect(contient(net, "GPS-SECRET")).toBe(false);
    expect(contient(net, "xmp-secret")).toBe(false);
    expect(contient(net, "VP8 ")).toBe(true);
    const dv = new DataView(net.buffer, net.byteOffset, net.byteLength);
    expect(dv.getUint32(4, true)).toBe(net.length - 8);
    const i = Buffer.from(net).indexOf(Buffer.from("VP8X"));
    expect(net[i + 8] & 0x0c).toBe(0); // EXIF et XMP désannoncés
    expect(net[i + 8] & 0x20).toBe(0x20); // le profil colorimétrique ICC est conservé
  });

  test("PDF : inchangé ; HEIC : refusé", () => {
    const pdf = remplir(texte("%PDF-1.7"));
    expect(nettoyerMetadonnees(pdf, detecterType(pdf)!)).toBe(pdf);
    const heic = remplir([0, 0, 0, 24, ...texte("ftypheic")]);
    expect(() => nettoyerMetadonnees(heic, detecterType(heic)!)).toThrow("HEIC");
  });
});

describe("nom d'objet", () => {
  test("généré côté serveur, extension issue du format détecté", () => {
    const jpeg = detecterType(remplir([0xff, 0xd8, 0xff, 0xe0]))!;
    expect(nomObjet("pat-1", "documents", jpeg, "uuid-1")).toBe("documents/pat-1/uuid-1.jpg");
  });
});
