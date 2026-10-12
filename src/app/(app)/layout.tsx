import { asc } from "drizzle-orm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { SoignanteProvider } from "@/lib/soignante-context";
import { BottomNav } from "@/components/nav/BottomNav";
import { withSoignante, soignantePublicColumns } from "@/lib/db";
import { getDemoEquipe, isDemoModeEnabled, isOfflineDbError } from "@/lib/demo-data";
import { soignantes } from "@/lib/schema";

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

  return (
    <SoignanteProvider current={current} equipe={equipe.length ? equipe : [current]}>
      <div className="min-h-dvh pb-20 safe-top">{children}</div>
      <BottomNav />
    </SoignanteProvider>
  );
}
