/** @type {import('next').NextConfig} */

// En-têtes de sécurité communs à toutes les réponses. La CSP, qui dépend d'un
// nonce par requête, est posée par src/middleware.ts.
const entetesSecurite = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ni caméra, ni micro, ni géolocalisation : l'appli n'en a pas l'usage (les photos passent
  // par la sélection de fichier). À rouvrir (microphone=(self)) le jour où la dictée vocale arrive.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: entetesSecurite }];
  },
  experimental: {
    // src/instrumentation.ts : contrôle du rôle Postgres au démarrage.
    instrumentationHook: true,
    // Envoi de documents / ordonnances via Server Actions (Vercel plafonne à 4,5 Mo).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
