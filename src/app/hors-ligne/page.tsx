import { HorsLigneApp } from "@/components/offline/HorsLigneApp";

// Coquille du mode hors-ligne : AUCUNE donnée ici (page publique, mise en cache par
// le service worker). La tournée et les fiches sont lues sur l'appareil, où elles sont
// stockées chiffrées (src/lib/offline/stockage.ts).
export const metadata = { title: "Hors-ligne — Isabelle" };

export default function HorsLignePage() {
  return <HorsLigneApp />;
}
