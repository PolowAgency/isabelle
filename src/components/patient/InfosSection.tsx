"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Dog,
  KeyRound,
  LoaderCircle,
  Pencil,
  StickyNote,
  UserRound,
} from "lucide-react";
import { updatePatientAccessAction } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Snackbar } from "@/components/ui/Snackbar";
import type { PatientAccess } from "@/lib/patient-detail";

type EditorKey =
  | "codePortail"
  | "codeImmeuble"
  | "etage"
  | "digicodePorte"
  | "emplacementCle"
  | "stationnement"
  | "notesAcces"
  | "animal"
  | "aidant";

type EditorState = {
  key: EditorKey;
  title: string;
} | null;

function fieldValue(value: string | null, fallback = "Ajouter") {
  return value || fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InfosSection({
  patientId,
  accessInitial,
}: {
  patientId: string;
  accessInitial: PatientAccess;
}) {
  const [access, setAccess] = useState(accessInitial);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const cards = useMemo(
    () => [
      { key: "codePortail" as const, label: "Code portail", value: fieldValue(access.codePortail) },
      { key: "codeImmeuble" as const, label: "Code immeuble", value: fieldValue(access.codeImmeuble) },
      { key: "etage" as const, label: "Étage", value: fieldValue(access.etage) },
      { key: "digicodePorte" as const, label: "Digicode porte", value: fieldValue(access.digicodePorte) },
      { key: "emplacementCle" as const, label: "Emplacement clé", value: fieldValue(access.emplacementCle) },
      {
        key: "animal" as const,
        label: "Animal",
        value: access.presenceAnimal
          ? access.descriptionAnimal || "Présent"
          : "Aucun animal signalé",
      },
      {
        key: "aidant" as const,
        label: "Aidant",
        value: access.presenceAidant
          ? access.detailsAidant || "Présent"
          : "Pas d'aidant signalé",
      },
      {
        key: "stationnement" as const,
        label: "Stationnement",
        value: fieldValue(access.stationnement),
      },
      { key: "notesAcces" as const, label: "Notes", value: fieldValue(access.notesAcces) },
    ],
    [access]
  );

  async function savePatch(patch: Parameters<typeof updatePatientAccessAction>[0]["patch"]) {
    startTransition(async () => {
      try {
        const next = await updatePatientAccessAction({ patientId, patch });
        setAccess(next);
        setEditor(null);
        setToast("Accès domicile mis a jour.");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Impossible de mettre a jour l'acces.");
      }
    });
  }

  async function handleCopy(value: string | null, key: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setToast(`${label} copié.`);
      window.setTimeout(() => {
        setCopied((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setToast(`Impossible de copier ${label.toLowerCase()}.`);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-pine">Accès domicile</h2>
              <p className="mt-1 text-sm text-pine/55">
                Gros pense-bete modifiable en un tap avant d&apos;entrer chez le patient.
              </p>
            </div>
            <KeyRound size={18} className="shrink-0 text-coral" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <QuickCopyButton
            icon={KeyRound}
            label={copied === "portail" ? "Code portail copié" : "Copier code portail"}
            value={access.codePortail}
            onCopy={() => handleCopy(access.codePortail, "portail", "Code portail")}
          />
          <QuickCopyButton
            icon={KeyRound}
            label={copied === "digicode" ? "Digicode copié" : "Copier digicode"}
            value={access.digicodePorte}
            onCopy={() => handleCopy(access.digicodePorte, "digicode", "Digicode")}
          />
          <QuickCopyButton
            icon={Copy}
            label={copied === "cle" ? "Emplacement copié" : "Copier emplacement clé"}
            value={access.emplacementCle}
            onCopy={() => handleCopy(access.emplacementCle, "cle", "Emplacement clé")}
          />
          <QuickCopyButton
            icon={StickyNote}
            label={copied === "notes" ? "Notes copiées" : "Copier notes d'accès"}
            value={access.notesAcces}
            onCopy={() => handleCopy(access.notesAcces, "notes", "Notes d'accès")}
          />
        </div>

        <div className="grid gap-3">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setEditor({ key: card.key, title: card.label })}
              className="rounded-[24px] border border-line/80 bg-card p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-pine/35">
                  {card.label}
                </p>
                <Pencil size={14} className="text-pine/35" />
              </div>
              <p className="text-lg font-semibold leading-snug text-ink">{card.value}</p>
            </button>
          ))}
        </div>

        {access.updatedAt ? (
          <p className="px-1 text-xs text-pine/45">
            Dernière mise à jour : {formatDateTime(access.updatedAt)}
          </p>
        ) : null}
      </section>

      <BottomSheet
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.title}
      >
        {editor ? (
          <AccessEditorContent
            editor={editor}
            access={access}
            pending={pending}
            onSave={savePatch}
          />
        ) : null}
      </BottomSheet>

      {toast ? (
        <Snackbar message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </>
  );
}

function QuickCopyButton({
  icon: Icon,
  label,
  value,
  onCopy,
}: {
  icon: typeof Copy;
  label: string;
  value: string | null;
  onCopy: () => void;
}) {
  const disabled = !value;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCopy}
      className="flex items-center justify-center gap-2 rounded-2xl border border-line/80 bg-card px-3 py-3 text-sm font-semibold text-pine shadow-card disabled:opacity-45"
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function AccessEditorContent({
  editor,
  access,
  pending,
  onSave,
}: {
  editor: NonNullable<EditorState>;
  access: PatientAccess;
  pending: boolean;
  onSave: (patch: Parameters<typeof updatePatientAccessAction>[0]["patch"]) => void;
}) {
  const [textValue, setTextValue] = useState(() => {
    switch (editor.key) {
      case "codePortail":
        return access.codePortail ?? "";
      case "codeImmeuble":
        return access.codeImmeuble ?? "";
      case "etage":
        return access.etage ?? "";
      case "digicodePorte":
        return access.digicodePorte ?? "";
      case "emplacementCle":
        return access.emplacementCle ?? "";
      case "stationnement":
        return access.stationnement ?? "";
      case "notesAcces":
        return access.notesAcces ?? "";
      default:
        return "";
    }
  });
  const [presence, setPresence] = useState(
    editor.key === "animal"
      ? access.presenceAnimal
      : editor.key === "aidant"
        ? access.presenceAidant
        : false
  );
  const [details, setDetails] = useState(
    editor.key === "animal"
      ? access.descriptionAnimal ?? ""
      : editor.key === "aidant"
        ? access.detailsAidant ?? ""
        : ""
  );

  const multiline = editor.key === "stationnement" || editor.key === "notesAcces";
  const isPresenceEditor = editor.key === "animal" || editor.key === "aidant";

  return (
    <div className="flex flex-col gap-4">
      {isPresenceEditor ? (
        <>
          <button
            type="button"
            onClick={() => setPresence((value) => !value)}
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${
              presence ? "border-pine bg-pine text-cream" : "border-line bg-card text-pine"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {editor.key === "animal" ? <Dog size={18} /> : <UserRound size={18} />}
              {editor.key === "animal" ? "Présence d'un animal" : "Présence d'un aidant"}
            </span>
            {presence ? <Check size={18} /> : null}
          </button>

          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={4}
            placeholder={
              editor.key === "animal"
                ? "Description, consignes, comportement..."
                : "Nom, horaires, points de vigilance..."
            }
            className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          />

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onSave(
                editor.key === "animal"
                  ? {
                      presenceAnimal: presence,
                      descriptionAnimal: details,
                    }
                  : {
                      presenceAidant: presence,
                      detailsAidant: details,
                    }
              )
            }
            className="flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
            Enregistrer
          </button>
        </>
      ) : (
        <>
          {multiline ? (
            <textarea
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          ) : (
            <input
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              className="h-12 w-full rounded-2xl border border-line bg-card px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => onSave({ [editor.key]: textValue } as Parameters<typeof updatePatientAccessAction>[0]["patch"])}
            className="flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
            Enregistrer
          </button>
        </>
      )}
    </div>
  );
}
