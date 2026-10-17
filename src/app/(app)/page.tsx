import { getCurrentSoignante } from "@/lib/current-soignante";
import { getTourneeVisites, type VuePassage, type VueTournee } from "@/lib/tournee";
import { todayISO } from "@/lib/date";
import { getOnboarding } from "@/lib/onboarding";
import { isIsabelleAdmin } from "@/lib/team";
import { TourneeScreen } from "@/components/today/TourneeScreen";

const VUES_VALIDES: VuePassage[] = ["jour", "matin", "midi", "soir"];

export default async function TourneePage({
  searchParams,
}: {
  searchParams: { passage?: string; vue?: string };
}) {
  const current = await getCurrentSoignante();

  // Par défaut : la journée entière, en timeline par tranche horaire.
  const passage: VuePassage = VUES_VALIDES.includes(searchParams.passage as VuePassage)
    ? (searchParams.passage as VuePassage)
    : "jour";
  const vue: VueTournee = searchParams.vue === "equipe" ? "equipe" : "mine";
  const date = todayISO();

  const [visites, onboarding] = await Promise.all([
    getTourneeVisites(current.id, date, passage, vue),
    getOnboarding(current.id),
  ]);

  return (
    <TourneeScreen
      key={`${passage}-${vue}`}
      visitesInitiales={visites}
      date={date}
      passage={passage}
      vue={vue}
      onboarding={onboarding}
      admin={isIsabelleAdmin(current)}
    />
  );
}
