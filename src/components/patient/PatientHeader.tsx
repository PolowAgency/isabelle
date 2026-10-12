"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  MapPin,
  Navigation,
  Phone,
  Stethoscope,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { PatientSummary } from "@/lib/patient-detail";

function getInitiales(prenom: string, nom: string) {
  return `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
}

export function PatientHeader({ patient }: { patient: PatientSummary }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const address = [patient.adresse, patient.complementAdresse, patient.codePostal, patient.ville]
    .filter(Boolean)
    .join(", ");
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  async function handleCopy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <header className="rounded-b-[28px] bg-pine px-5 pb-5 pt-4 safe-top">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-cream/75"
      >
        <ChevronLeft size={18} />
        Retour
      </button>

      <div className="flex items-start gap-4">
        <Avatar
          initiales={getInitiales(patient.prenom, patient.nom)}
          couleur="#e0704a"
          size={58}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[28px] font-semibold leading-none text-cream">
              {patient.prenom} {patient.nom}
            </h1>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: `${patient.secteurCouleur}33`,
                color: "#f6f1e7",
              }}
            >
              {patient.secteurNom}
            </span>
          </div>

          <p className="mt-2 text-sm text-cream/75">
            {patient.age !== null ? `${patient.age} ans` : "Âge non renseigné"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex items-start gap-2 rounded-2xl bg-cream/10 px-3 py-2.5 text-sm text-cream/85">
          <MapPin size={16} className="mt-0.5 shrink-0" />
          <span>
            {address || "Adresse non renseignée"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ActionButton
            href={patient.telephone ? `tel:${patient.telephone.replace(/\s+/g, "")}` : null}
            icon={Phone}
            label={patient.telephone ? "Appeler" : "Pas de n°"}
            disabled={!patient.telephone}
          />
          <ActionButton
            href={mapsHref}
            icon={Navigation}
            label={mapsHref ? "Itinéraire" : "Pas d'adresse"}
            disabled={!mapsHref}
          />
          <button
            type="button"
            disabled={!address}
            onClick={() => (address ? handleCopy(address, "address") : undefined)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-cream px-2 py-2.5 text-xs font-semibold text-pine disabled:opacity-50"
          >
            <Copy size={18} />
            {copied === "address" ? "Copiée ✓" : "Copier"}
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-2xl bg-cream/10 px-3 py-2.5 text-sm text-cream/85">
          <Stethoscope size={16} className="mt-0.5 shrink-0" />
          <span>
            {patient.medecinTraitantNom ?? "Médecin non renseigné"}
            {patient.medecinTraitantTelephone ? ` · ${patient.medecinTraitantTelephone}` : ""}
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-2xl bg-cream/10 px-3 py-2.5 text-sm text-cream/85">
          <Users size={16} className="mt-0.5 shrink-0" />
          <span>
            {patient.contactUrgenceNom
              ? [
                  patient.contactUrgenceNom,
                  patient.contactUrgenceLien ? `(${patient.contactUrgenceLien})` : null,
                  patient.contactUrgenceTelephone,
                ]
                  .filter(Boolean)
                  .join(" ")
              : "Aucun contact d'urgence renseigné"}
          </span>
        </div>

      </div>
    </header>
  );
}

function ActionButton({
  href,
  icon: Icon,
  label,
  disabled,
}: {
  href: string | null;
  icon: typeof Phone;
  label: string;
  disabled: boolean;
}) {
  if (!href || disabled) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-cream/10 px-3 py-3 text-sm font-semibold text-cream/55">
        <Icon size={15} />
        {label}
      </div>
    );
  }

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-cream px-2 py-2.5 text-xs font-semibold text-pine"
    >
      <Icon size={18} />
      {label}
    </a>
  );
}
