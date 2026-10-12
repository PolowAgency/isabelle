import { DayCard } from "@/components/week/DayCard";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getWeekVisits, isoDate, startOfWeek } from "@/lib/week";

export default async function SemainePage() {
  const current = await getCurrentSoignante();
  const monday = startOfWeek(new Date());
  const jours = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return isoDate(day);
  });

  const visites = await getWeekVisits(current.id, jours[0], jours[6]);

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Semaine</h1>
      <p className="mb-4 text-sm text-pine/55">
        Touchez un jour pour voir le détail.
      </p>

      <DayCard jours={jours} visites={visites} />
    </div>
  );
}
