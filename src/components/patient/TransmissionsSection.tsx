"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCheck,
  LoaderCircle,
  Mic,
  MicOff,
  Send,
} from "lucide-react";
import {
  addTransmissionAction,
  markTransmissionReadAction,
} from "@/app/(app)/actions";
import { Snackbar } from "@/components/ui/Snackbar";
import { Avatar } from "@/components/ui/Avatar";
import { useDictation } from "@/hooks/useDictation";
import type { PatientTransmission } from "@/lib/patient-detail";

const IMPORTANCE_STYLES: Record<PatientTransmission["importance"], string> = {
  info: "bg-pine/10 text-pine",
  attention: "bg-[#c9954a]/15 text-[#8b6117]",
  urgent: "bg-[#c0503a]/15 text-[#a13c2b]",
};

export function TransmissionsSection({
  patientId,
  transmissionsInitiales,
}: {
  patientId: string;
  transmissionsInitiales: PatientTransmission[];
}) {
  const [transmissions, setTransmissions] = useState(transmissionsInitiales);
  const [contenu, setContenu] = useState("");
  const [importance, setImportance] =
    useState<PatientTransmission["importance"]>("info");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { supported, listening, toggle } = useDictation((text) =>
    setContenu((current) => (current ? `${current} ${text}` : text))
  );
  const urgentUnreadCount = useMemo(
    () =>
      transmissions.filter(
        (transmission) =>
          transmission.importance === "urgent" && !transmission.isRead
      ).length,
    [transmissions]
  );

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function handleSubmit() {
    if (!contenu.trim()) return;

    startTransition(async () => {
      try {
        const created = await addTransmissionAction({
          patientId,
          contenu,
          importance,
        });

        setTransmissions((current) => [created, ...current]);
        setContenu("");
        setImportance("info");
      } catch (error) {
        setToast(
          error instanceof Error ? error.message : "Impossible d'ajouter la transmission."
        );
      }
    });
  }

  function handleMarkRead(transmissionId: string) {
    setTransmissions((current) =>
      current.map((item) =>
        item.id === transmissionId ? { ...item, isRead: true } : item
      )
    );

    startTransition(async () => {
      try {
        await markTransmissionReadAction(transmissionId);
      } catch (error) {
        setTransmissions((current) =>
          current.map((item) =>
            item.id === transmissionId ? { ...item, isRead: false } : item
          )
        );
        setToast(
          error instanceof Error ? error.message : "Impossible de marquer comme lue."
        );
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {urgentUnreadCount > 0 ? (
          <section className="rounded-[24px] border border-coral/25 bg-coral/10 p-4 shadow-card">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-coral" />
              <div>
                <h2 className="font-serif text-lg font-semibold text-coral">
                  Priorité clinique
                </h2>
                <p className="mt-1 text-sm leading-6 text-coral/90">
                  {urgentUnreadCount} transmission{urgentUnreadCount > 1 ? "s" : ""} urgente
                  {urgentUnreadCount > 1 ? "s" : ""} non lue
                  {urgentUnreadCount > 1 ? "s" : ""} sur ce dossier.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {transmissions.length === 0 ? (
          <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
            <h2 className="font-serif text-xl font-semibold text-pine">Transmissions</h2>
            <p className="mt-2 text-sm text-pine/45">
              Aucun message pour ce patient. La saisie rapide reste disponible en bas.
            </p>
          </section>
        ) : (
          transmissions.map((transmission) => (
            <article
              key={transmission.id}
              className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  initiales={`${transmission.soignante.prenom[0] ?? ""}${transmission.soignante.nom[0] ?? ""}`.toUpperCase()}
                  couleur={transmission.soignante.couleur}
                  size={38}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {transmission.soignante.prenom} {transmission.soignante.nom}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        IMPORTANCE_STYLES[transmission.importance]
                      }`}
                    >
                      {transmission.importance}
                    </span>
                    {transmission.importance === "urgent" ? (
                      <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-semibold text-coral">
                        À traiter
                      </span>
                    ) : null}
                    {!transmission.isRead ? (
                      <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">
                        Non lue
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-pine/45">
                    {formatDate(transmission.createdAt)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-pine/80">
                    {transmission.contenu}
                  </p>

                  {!transmission.isRead ? (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(transmission.id)}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-pine px-3 py-2 text-xs font-semibold text-cream"
                    >
                      <CheckCheck size={14} />
                      Marquer comme lue
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="fixed bottom-20 left-0 right-0 z-30 px-4 safe-bottom">
        <div className="rounded-[26px] border border-line bg-card p-3 shadow-sheet">
          <div className="mb-2 flex gap-2">
            {(["info", "attention", "urgent"] as const).map((level) => {
              const active = importance === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setImportance(level)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? IMPORTANCE_STYLES[level]
                      : "border border-line bg-cream text-pine/55"
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={contenu}
              onChange={(event) => setContenu(event.target.value)}
              rows={2}
              placeholder="Ajouter une transmission..."
              className="min-h-[72px] flex-1 resize-none rounded-2xl border border-line bg-cream px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />

            <div className="flex flex-col gap-2">
              {supported ? (
                <button
                  type="button"
                  onClick={toggle}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                    listening ? "bg-coral text-white" : "bg-pine/10 text-pine"
                  }`}
                  aria-label={listening ? "Arreter la dictee" : "Dicter"}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              ) : null}

              <button
                type="button"
                disabled={pending || !contenu.trim()}
                onClick={handleSubmit}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pine text-cream disabled:opacity-50"
                aria-label="Envoyer"
              >
                {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast ? <Snackbar message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
