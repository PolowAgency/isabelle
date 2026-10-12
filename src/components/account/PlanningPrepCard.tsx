"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus2, CopyPlus, LoaderCircle } from "lucide-react";
import {
  dupliquerJourAction,
  genererSemaineSuivanteAction,
} from "@/app/(app)/actions";

function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function PlanningPrepCard({
  weekStart,
  weekEnd,
}: {
  weekStart: string;
  weekEnd: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState(weekEnd);
  const [target, setTarget] = useState(addDays(weekEnd, 7));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nextWeek = useMemo(
    () => ({
      start: addDays(weekStart, 7),
      end: addDays(weekEnd, 7),
    }),
    [weekEnd, weekStart]
  );

  function handleCopyDay() {
    if (!target) return;
    startTransition(async () => {
      try {
        await dupliquerJourAction(source, target);
        setMessage(`Journée copiée vers le ${formatDateLong(target)}.`);
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Impossible de copier cette journée."
        );
      }
    });
  }

  function handleGenerateWeek() {
    startTransition(async () => {
      try {
        await genererSemaineSuivanteAction(weekStart);
        setMessage(
          `Semaine générée du ${formatDateLong(nextWeek.start)} au ${formatDateLong(nextWeek.end)}.`
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Impossible de générer la semaine suivante."
        );
      }
    });
  }

  return (
    <div className="mt-4 rounded-2xl bg-cream px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pine/35">
        Préparation tournée
      </p>
      <p className="mt-1 text-sm leading-6 text-pine/60">
        Préparer la semaine suivante depuis la semaine du {formatDateLong(weekStart)} au{" "}
        {formatDateLong(weekEnd)}.
      </p>

      {message ? (
        <div className="mt-3 rounded-xl border border-pine/15 bg-card px-3 py-2 text-sm text-pine">
          {message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        <div className="rounded-2xl border border-line/70 bg-card px-3 py-3">
          <div className="flex items-start gap-2">
            <CalendarPlus2 size={16} className="mt-0.5 text-coral" />
            <div>
              <p className="text-sm font-semibold text-pine">Générer la semaine suivante</p>
              <p className="mt-1 text-sm text-pine/55">
                Créera la semaine du {formatDateLong(nextWeek.start)} au{" "}
                {formatDateLong(nextWeek.end)} à partir du modèle actuel.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={handleGenerateWeek}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={15} className="animate-spin" /> : <CalendarPlus2 size={15} />}
            Générer la semaine suivante
          </button>
        </div>

        <div className="rounded-2xl border border-line/70 bg-card px-3 py-3">
          <div className="flex items-start gap-2">
            <CopyPlus size={16} className="mt-0.5 text-coral" />
            <div>
              <p className="text-sm font-semibold text-pine">Copier une journée type</p>
              <p className="mt-1 text-sm text-pine/55">
                Pratique pour reprendre un samedi ou un lundi sans tout ressaisir.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-pine/45">Depuis</span>
              <input
                type="date"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-pine/45">Vers</span>
              <input
                type="date"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={pending || !target}
            onClick={handleCopyDay}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={15} className="animate-spin" /> : <CopyPlus size={15} />}
            Copier cette journée
          </button>
        </div>
      </div>
    </div>
  );
}
