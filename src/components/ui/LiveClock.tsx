"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/date";

/**
 * Heure réelle, mise à jour chaque seconde côté client. `now` démarre à
 * `null` (rien n'est affiché tant que le composant n'est pas monté) pour
 * éviter tout écart entre le rendu serveur et l'heure du navigateur.
 */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <span className={className}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-statut-faite animate-pulse" />
      {formatTime(now)}
    </span>
  );
}
