import { isDemoModeEnabled } from "@/lib/demo-data";

export function DemoBanner() {
  if (!isDemoModeEnabled()) return null;

  return (
    <div className="bg-coral text-white text-xs font-medium text-center py-1.5 px-3 safe-top">
      Environnement de démonstration — données fictives
    </div>
  );
}
