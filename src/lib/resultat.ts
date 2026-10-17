// Erreurs « attendues » (saisie invalide, règle métier) renvoyées au client
// sous forme de résultat : en production Next masque le message d'une
// exception levée dans une Server Action, l'utilisatrice ne le verrait pas.
// Les erreurs inattendues continuent de remonter normalement.

export class ErreurMetier extends Error {}

export type Resultat<T> = { ok: true; data: T } | { ok: false; error: string };

export async function enResultat<T>(fn: () => Promise<T>): Promise<Resultat<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    // RangeError : dates / durées invalides détectées par recurrence.ts.
    if (error instanceof ErreurMetier || error instanceof RangeError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
