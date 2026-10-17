import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AbsencesGestion } from "@/components/absences/AbsencesGestion";
import { listerAbsences } from "@/lib/absences";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { todayISO } from "@/lib/date";
import { getEquipe, isAdmin } from "@/lib/team";

export default async function AbsencesPage() {
  const current = await getCurrentSoignante();
  const admin = isAdmin(current);
  const [absences, equipe] = await Promise.all([listerAbsences(current.id), getEquipe(current.id)]);
  const aujourdhui = todayISO();
  const actives = equipe.filter((s) => s.actif && (!s.dateFin || s.dateFin >= aujourdhui));

  return (
    <div className="px-4 pb-24 pt-4">
      <Link href="/compte" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-coral">
        <ChevronLeft size={16} /> Compte
      </Link>
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Absences et congés</h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        Déclarez une absence : l&apos;application liste les visites concernées et vous propose de les confier à vos
        collègues, qui acceptent ou refusent. N&apos;indiquez jamais d&apos;information médicale dans le motif.
      </p>
      <AbsencesGestion
        absences={absences}
        moiId={current.id}
        admin={admin}
        equipe={actives.map((s) => ({ id: s.id, prenom: s.prenom, nom: s.nom }))}
        aujourdhui={aujourdhui}
      />
    </div>
  );
}
