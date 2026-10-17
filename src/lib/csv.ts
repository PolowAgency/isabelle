// CSV pensé pour Excel / LibreOffice en français : séparateur « ; », BOM UTF-8
// (accents corrects à l'ouverture), fins de ligne CRLF.

const SEPARATEUR = ";";

/**
 * Neutralise l'injection de formules : une cellule commençant par = + - @
 * (ou tabulation / retour chariot) serait interprétée comme formule par le
 * tableur. On la préfixe d'une apostrophe, qui reste visible mais inoffensive.
 */
function proteger(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
}

export function celluleCsv(valeur: string | number | null | undefined): string {
  const texte = valeur === null || valeur === undefined ? "" : proteger(String(valeur));
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function versCsv(entetes: string[], lignes: (string | number | null | undefined)[][]): string {
  const toutes = [entetes, ...lignes].map((ligne) => ligne.map(celluleCsv).join(SEPARATEUR));
  return `﻿${toutes.join("\r\n")}\r\n`;
}
