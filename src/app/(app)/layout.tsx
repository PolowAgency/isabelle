import { asc } from "drizzle-orm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { SoignanteProvider } from "@/lib/soignante-context";
import { BottomNav } from "@/components/nav/BottomNav";
import { withSoignante, soignantePublicColumns } from "@/lib/db";
import { getDemoEquipe, isDemoModeEnabled, isOfflineDbError } from "@/lib/demo-data";
import { soignantes } from "@/lib/schema";
import { getAlertesCount } from "@/lib/alerts";
import { OfflineManager } from "@/components/offline/OfflineManager";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSoignante();

  let equipe;
  try {
    equipe = await withSoignante(current.id, (tx) =>
      tx
        .select(soignantePublicColumns)
        .from(soignantes)
        .orderBy(asc(soignantes.role), asc(soignantes.nom))
    );
  } catch (error) {
    if (isDemoModeEnabled() && isOfflineDbError(error)) {
      equipe = getDemoEquipe();
    } else {
      throw error;
    }
  }

  const alertesCount = await getAlertesCount(current.id);

  return (
    <SoignanteProvider current={current} equipe={equipe.length ? equipe : [current]}>
      <div className="min-h-dvh pb-20 safe-top">{children}</div>
      <OfflineManager soignanteId={current.id} />
      <BottomNav alertesCount={alertesCount} />
    </SoignanteProvider>
  );
}
