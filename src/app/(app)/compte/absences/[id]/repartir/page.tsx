import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { RepartitionAbsence } from "@/components/absences/RepartitionAbsence";
import { lireDonneesRepartition } from "@/lib/absences";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { ErreurMetier } from "@/lib/resultat";
import { getReglagesPlanning } from "@/lib/planning";
import { isAdmin } from "@/lib/team";
import { uuid } from "@/lib/validation";

export default async function RepartirAbsencePage({ params }: { params: { id: string } }) {
  if (!uuid.safeParse(params.id).success) notFound();
  const current = await getCurrentSoignante();
  let donnees;
  try {
    donnees = await lireDonneesRepartition(current.id, isAdmin(current), params.id);
  } catch (e) {
    if (e instanceof ErreurMetier) redirect("/compte/absences");
    throw e;
  }
  const planning = await getReglagesPlanning(current.id);

  return (
    <div className="px-4 pb-32 pt-4">
      <Link href="/compte/absences" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-coral">
        <ChevronLeft size={16} /> Absences
      </Link>
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Répartir les visites</h1>
      <RepartitionAbsence donnees={donnees} durees={planning.durees} capaciteMin={planning.capaciteTrancheMin} />
    </div>
  );
}
