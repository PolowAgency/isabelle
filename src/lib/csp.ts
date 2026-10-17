// Politique de sécurité du contenu (CSP), avec nonce par requête : seuls les
// scripts émis par Next (marqués du nonce) s'exécutent, aucun script injecté.
// Fonction pure, utilisable dans le middleware (Edge) et testable.

export function construireCsp(options: {
  nonce: string;
  dev?: boolean;
  /** Origine du stockage S3 (images et PDF signés), si configuré. */
  origineStockage?: string | null;
}): string {
  const { nonce, dev = false, origineStockage = null } = options;
  const stockage = origineStockage ? ` ${origineStockage}` : "";

  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' : les scripts chargés par un script de confiance le sont aussi.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Les attributs style="" de React / Tailwind imposent 'unsafe-inline' pour les styles
    // (sans risque d'exécution de script).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${stockage}`,
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function origineDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
