"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, Paperclip } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { creerOrdonnanceAction } from "@/app/(app)/actions";
import { compresserImage } from "@/lib/image-client";
import { todayISO } from "@/lib/date";

const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

export function AjouterOrdonnanceSheet({
  open,
  onClose,
  patientId,
  storageConfigured,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [prescripteur, setPrescripteur] = useState("");
  const [datePrescription, setDatePrescription] = useState(todayISO());
  const [dateFin, setDateFin] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPrescripteur("");
    setDatePrescription(todayISO());
    setDateFin("");
    setDescription("");
    setFile(null);
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("patientId", patientId);
        formData.set("prescripteur", prescripteur);
        formData.set("datePrescription", datePrescription);
        formData.set("dateFin", dateFin);
        formData.set("description", description);
        if (file) formData.set("file", await compresserImage(file));
        const res = await creerOrdonnanceAction(formData);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        reset();
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d'enregistrer l'ordonnance.");
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nouvelle ordonnance">
      <form onSubmit={handleSubmit} className="grid gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Prescripteur</span>
          <input
            value={prescripteur}
            onChange={(e) => setPrescripteur(e.target.value)}
            placeholder="Dr Martin"
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Date</span>
            <input
              type="date"
              value={datePrescription}
              onChange={(e) => setDatePrescription(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Fin de validité</span>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Soins prescrits</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Pansement quotidien, injection d'insuline matin et soir…"
            className="w-full rounded-2xl border border-line bg-cream px-4 py-3 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          />
        </label>

        {storageConfigured ? (
          <div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold text-pine"
              >
                <Camera size={16} /> Photographier
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold text-pine"
              >
                <Paperclip size={16} /> Joindre un fichier
              </button>
            </div>
            {file ? (
              <p className="mt-2 truncate text-sm text-pine/65">
                {file.name} ({Math.max(1, Math.round(file.size / 1024))} Ko)
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-pine/55">
            L&apos;ajout de photo ou de PDF n&apos;est pas encore activé : tu peux déjà saisir
            l&apos;ordonnance.
          </p>
        )}

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          Enregistrer l&apos;ordonnance
        </button>
      </form>
    </BottomSheet>
  );
}
