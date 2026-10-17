import { DayCard } from "@/components/week/DayCard";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { ajouterJours } from "@/lib/recurrence";
import { todayISO } from "@/lib/date";
import { joursDeLaSemaine, lundiDe, lundiDemande, ordreJours } from "@/lib/semaine";
import { absencesSurPeriode } from "@/lib/absences";
import { getReglagesPlanning } from "@/lib/planning";
import { getWeekVisits } from "@/lib/week";

export default async function SemainePage({
  searchParams,
}: {
  searchParams: { semaine?: string };
}) {
  const current = await getCurrentSoignante();
  const aujourdhui = todayISO();
  const lundi = lundiDemande(searchParams.semaine, aujourdhui);
  const jours = joursDeLaSemaine(lundi);

  const [visites, absences, planning] = await Promise.all([
    getWeekVisits(current.id, jours[0], jours[6]),
    absencesSurPeriode(current.id, jours[0], jours[6]),
    getReglagesPlanning(current.id),
  ]);

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Semaine</h1>
      <p className="mb-4 text-sm text-pine/55">
        Le planning du jour s&apos;ouvre en premier. Touchez un autre jour pour voir le détail.
      </p>

      <DayCard
        key={lundi}
        jours={ordreJours(jours, aujourdhui)}
        visites={visites}
        absences={absences}
        durees={planning.durees}
        capaciteMin={planning.capaciteTrancheMin}
        aujourdhui={aujourdhui}
        lundi={lundi}
        semainePrecedente={ajouterJours(lundi, -7)}
        semaineSuivante={ajouterJours(lundi, 7)}
        estSemaineCourante={lundi === lundiDe(aujourdhui)}
      />
    </div>
  );
}
