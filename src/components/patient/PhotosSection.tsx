"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, FileText, LoaderCircle, Upload } from "lucide-react";
import { uploadPatientDocumentAction } from "@/app/(app)/actions";
import { Snackbar } from "@/components/ui/Snackbar";
import { compresserImage } from "@/lib/image-client";
import type { PatientDocument } from "@/lib/patient-detail";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PhotosSection({
  patientId,
  documentsInitials,
  storageConfigured,
}: {
  patientId: string;
  documentsInitials: PatientDocument[];
  storageConfigured: boolean;
}) {
  const [documents, setDocuments] = useState(documentsInitials);
  const [legende, setLegende] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePick(file: File | null) {
    if (!file) return;

    startTransition(async () => {
      try {
        const prepared = await compresserImage(file);
        const formData = new FormData();
        formData.set("patientId", patientId);
        formData.set("legende", legende);
        formData.set("file", prepared);

        const res = await uploadPatientDocumentAction(formData);
        if (!res.ok) {
          setToast(res.error);
          return;
        }
        setDocuments((current) => [res.data, ...current]);
        setLegende("");
        setToast("Document ajouté au dossier patient.");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Impossible d'envoyer le document.");
      }
    });
  }

  return (
    <>
      <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-pine">Documents</h2>
            <p className="mt-1 text-sm text-pine/55">
              Photos, PDF et pièces jointes, accessibles uniquement à l&apos;équipe.
            </p>
          </div>

          {pending ? <LoaderCircle size={18} className="animate-spin text-coral" /> : null}
        </div>

        {!storageConfigured ? (
          <div className="rounded-2xl border border-coral/25 bg-coral/10 px-4 py-3 text-sm leading-6 text-coral">
            L&apos;envoi de fichiers n&apos;est pas encore activé sur cette installation.
          </div>
        ) : (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                handlePick(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(event) => {
                handlePick(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />

            <div className="mb-3 rounded-2xl border border-line/70 bg-cream p-3">
              <input
                value={legende}
                onChange={(event) => setLegende(event.target.value)}
                placeholder="Légende (facultatif)"
                className="mb-3 h-11 w-full rounded-2xl border border-line bg-card px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Camera size={16} />
                  Photo
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold text-pine disabled:opacity-60"
                >
                  <Upload size={16} />
                  PDF / Fichier
                </button>
              </div>
            </div>
          </>
        )}

        {documents.length === 0 ? (
          <p className="text-sm text-pine/45">Aucun document dans ce dossier pour l&apos;instant.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {documents.map((document) => (
              <a
                key={document.id}
                href={document.signedUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-2xl border border-line/70 bg-cream"
              >
                {document.isImage && document.signedUrl ? (
                  <div className="aspect-square bg-pine/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={document.signedUrl}
                      alt={document.legende || document.filename}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-pine/5 text-pine/45">
                    <FileText size={30} />
                  </div>
                )}

                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-ink">{document.filename}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-pine/60">
                    {document.legende || "Sans legende"}
                  </p>
                  <p className="mt-2 text-xs text-pine/45">{formatDateTime(document.createdAt)}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {toast ? <Snackbar message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
