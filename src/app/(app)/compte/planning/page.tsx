import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ReglagesPlanningForm } from "@/components/account/ReglagesPlanningForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getReglagesPlanning } from "@/lib/planning";
import { actesAvecDuree } from "@/lib/planning-calc";
import { isAdmin } from "@/lib/team";

export default async function ReglagesPlanningPage() {
  const current = await getCurrentSoignante();
  if (!isAdmin(current)) redirect("/compte");
  const reglages = await getReglagesPlanning(current.id);

  return (
    <div className="px-4 pb-24 pt-4">
      <Link href="/compte" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-coral">
        <ChevronLeft size={16} /> Compte
      </Link>
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Durées et capacité</h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        La durée prévue d&apos;une visite est la somme des durées de ses actes. Elle reste modifiable à la main
        sur chaque visite. Une tranche qui dépasse sa capacité est signalée sur la tournée.
      </p>
      <ReglagesPlanningForm actes={actesAvecDuree(reglages.durees)} capaciteInitiale={reglages.capaciteTrancheMin} />
    </div>
  );
}
