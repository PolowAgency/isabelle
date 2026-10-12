import { getCurrentSoignante } from "@/lib/current-soignante";
import { getTourneeVisites, type Passage, type VueTournee } from "@/lib/tournee";
import { inferPassage, todayISO } from "@/lib/date";
import { TourneeScreen } from "@/components/today/TourneeScreen";

const PASSAGES_VALIDES: Passage[] = ["matin", "midi", "soir"];

export default async function TourneePage({
  searchParams,
}: {
  searchParams: { passage?: string; vue?: string };
}) {
  const current = await getCurrentSoignante();

  const passage: Passage = PASSAGES_VALIDES.includes(searchParams.passage as Passage)
    ? (searchParams.passage as Passage)
    : inferPassage();
  const vue: VueTournee = searchParams.vue === "equipe" ? "equipe" : "mine";
  const date = todayISO();

  const visites = await getTourneeVisites(current.id, date, passage, vue);

  return (
    <TourneeScreen
      key={`${passage}-${vue}`}
      visitesInitiales={visites}
      date={date}
      passage={passage}
      vue={vue}
    />
  );
}
