/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Envoi de documents / ordonnances via Server Actions (Vercel plafonne à 4,5 Mo).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
