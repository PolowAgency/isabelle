import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Rendu dynamique partout : la CSP utilise un nonce différent à chaque requête
// (src/middleware.ts), ce qui est impossible sur une page prérendue au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Isabelle — Tournée",
  description: "Coordination de tournée d'infirmières libérales",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#25453a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${fraunces.variable} ${workSans.variable} font-sans antialiased bg-cream text-pine`}
      >
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
