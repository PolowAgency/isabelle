"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "lucide-react";
import { marquerAlertePriseTraiteeAction } from "@/app/(app)/actions";
import type { PriseAlerte } from "@/lib/prises";
import { LIBELLES_PRISE } from "@/lib/prises-calc";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

/** Prises refusées ou non administrées, à prendre en compte (l'alerte disparaît pour toute l'équipe). */
export function PrisesAlertesSection({ prises }: { prises: PriseAlerte[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (prises.length === 0) return null;

  function traiter(p: PriseAlerte) {
    setErreur(null);
    startTransition(async () => {
      const res = await marquerAlertePriseTraiteeAction(p.id);
      if (!res.ok) setErreur(res.error);
      router.refresh();
    });
  }

  return (
    <section className="rounded-[24px] border border-statut-absent/30 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-pine">
        <Pill size={18} />
        <h2 className="font-serif text-xl font-semibold">Traitements à suivre</h2>
      </div>
      {erreur && <p role="alert" className="mb-3 text-sm text-statut-absent">{erreur}</p>}
      <ul className="flex flex-col gap-2">
        {prises.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              <Link href={`/patients/${p.patientId}`} className="underline underline-offset-2">
                {p.patientPrenom} {p.patientNom}
              </Link>
            </p>
            <p className="mt-0.5 text-sm text-pine/80">
              {p.traitement} ·{" "}
              <span className="font-semibold text-statut-absent">{LIBELLES_PRISE[p.statut].toLowerCase()}</span>
            </p>
            <p className="text-xs text-pine/55">
              {formatDate(p.date)}
              {p.soignantePrenom ? ` · saisi par ${p.soignantePrenom}` : ""}
            </p>
            {p.commentaire && <p className="mt-1 text-sm text-pine/70">« {p.commentaire} »</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() => traiter(p)}
              className="mt-2 text-xs font-semibold text-coral disabled:opacity-60"
            >
              Pris en compte
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
