"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  Clock3,
  FileText,
  HeartPulse,
  MessageSquareWarning,
  ShieldAlert,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { HistoriqueSection } from "@/components/patient/HistoriqueSection";
import { InfosSection } from "@/components/patient/InfosSection";
import { OrdonnancesSection } from "@/components/patient/OrdonnancesSection";
import { PatientHeader } from "@/components/patient/PatientHeader";
import { ProchainesVisitesSection } from "@/components/patient/ProchainesVisitesSection";
import { PhotosSection } from "@/components/patient/PhotosSection";
import { TraitementsSection } from "@/components/patient/TraitementsSection";
import { TransmissionsSection } from "@/components/patient/TransmissionsSection";
import type { PatientDetailData } from "@/lib/patient-detail";
import { libelleActe } from "@/lib/actes";
import { libelleTranche } from "@/lib/tranches";

type TabId = "acces" | "transmissions" | "soins" | "documents";

const TABS: {
  id: TabId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "acces", label: "Accès", icon: Shield },
  { id: "transmissions", label: "Transmissions", icon: MessageSquareWarning },
  { id: "soins", label: "Soins", icon: HeartPulse },
  { id: "documents", label: "Documents", icon: Camera },
];

const STATUS_LABELS: Record<string, string> = {
  prevue: "Prévue",
  faite: "Faite",
  absent: "Absent",
  reportee: "Reportée",
  annulee: "Annulée",
};

function formatVisitDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FichePatientScreen({
  patient,
  access,
  transmissions,
  treatments,
  ordonnances,
  visits,
  prochaines,
  series,
  documents,
  prises,
  storageConfigured,
}: PatientDetailData) {
  const [activeTab, setActiveTab] = useState<TabId>("acces");
  const lastVisit = visits.find((visit) => visit.statut !== "prevue") ?? visits[0] ?? null;
  const nextVisit = prochaines[0] ?? null;
  const urgentTransmission =
    transmissions.find((transmission) => transmission.importance === "urgent") ??
    transmissions[0] ??
    null;
  const ordonnanceAlerte =
    ordonnances.find((ordonnance) => ordonnance.active && ordonnance.statut === "soon") ??
    ordonnances.find((ordonnance) => ordonnance.active) ??
    null;
  const accessAlert = [
    access.codePortail ? `Portail ${access.codePortail}` : null,
    access.digicodePorte ? `Digicode ${access.digicodePorte}` : null,
    access.emplacementCle ? `Clé ${access.emplacementCle}` : null,
    access.presenceAnimal
      ? access.descriptionAnimal || "Animal présent"
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-dvh bg-cream">
      <PatientHeader patient={patient} />

      <section className="px-4 pt-4">
        <div className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-pine">
            <ShieldAlert size={18} />
            <h2 className="font-serif text-xl font-semibold">Résumé patient</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              icon={Clock3}
              label="Dernier passage"
              value={
                lastVisit
                  ? `${formatVisitDate(lastVisit.date)} · ${libelleTranche(lastVisit.tranche)}`
                  : "Aucun passage enregistré"
              }
              detail={
                lastVisit
                  ? `${STATUS_LABELS[lastVisit.statut]} · ${lastVisit.soignante.prenom} ${lastVisit.soignante.nom}`
                  : "Historique vide"
              }
            />

            <SummaryCard
              icon={MessageSquareWarning}
              label="Dernière transmission"
              value={
                urgentTransmission
                  ? urgentTransmission.importance === "urgent"
                    ? "Urgente à relire"
                    : "Transmission récente"
                  : "Aucune transmission"
              }
              detail={
                urgentTransmission
                  ? `${urgentTransmission.soignante.prenom} · ${formatDateTime(
                      urgentTransmission.createdAt
                    )}`
                  : "Aucun message clinique"
              }
            />

            <SummaryCard
              icon={HeartPulse}
              label="Prochain soin prévu"
              value={
                nextVisit
                  ? `${formatVisitDate(nextVisit.date)} · ${libelleTranche(nextVisit.tranche)}`
                  : "Aucun soin à venir"
              }
              detail={
                nextVisit
                  ? nextVisit.actes.map(libelleActe).join(" · ") || "Actes non renseignés"
                  : "Planning à compléter"
              }
            />

            <SummaryCard
              icon={AlertTriangle}
              label="Point de vigilance"
              value={
                ordonnanceAlerte
                  ? `Ordonnance jusqu'au ${ordonnanceAlerte.dateFin ?? "date inconnue"}`
                  : accessAlert || "Aucune alerte critique"
              }
              detail={
                ordonnanceAlerte
                  ? ordonnanceAlerte.description || "Renouvellement à anticiper"
                  : access.notesAcces || "Accès domicile stable"
              }
            />
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-20 border-b border-line bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="grid grid-cols-4 gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition ${
                  active ? "bg-pine text-cream shadow-card" : "bg-card text-pine/60"
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`px-4 pt-4 ${activeTab === "transmissions" ? "pb-40" : "pb-24"}`}>
        {activeTab === "acces" ? (
          <InfosSection patientId={patient.id} accessInitial={access} />
        ) : null}

        {activeTab === "transmissions" ? (
          <TransmissionsSection
            patientId={patient.id}
            transmissionsInitiales={transmissions}
          />
        ) : null}

        {activeTab === "soins" ? (
          <div className="flex flex-col gap-4">
            <ProchainesVisitesSection series={series} prochaines={prochaines} />
            <TraitementsSection traitements={treatments} patientId={patient.id} prises={prises} />
            <OrdonnancesSection
              ordonnances={ordonnances}
              patientId={patient.id}
              storageConfigured={storageConfigured}
            />
            <HistoriqueSection visites={visits} />
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="flex flex-col gap-4">
            <PhotosSection
              patientId={patient.id}
              documentsInitials={documents}
              storageConfigured={storageConfigured}
            />
            <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-pine">
                <FileText size={16} />
                <h2 className="font-serif text-lg font-semibold">Rappels</h2>
              </div>
              <p className="text-sm leading-6 text-pine/65">
                Les liens de consultation sont signes pour 15 minutes. Pour partager un
                document, il faut toujours repartir de cette fiche patient.
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
      <div className="flex items-center gap-2 text-pine/55">
        <Icon size={15} />
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-pine/55">{detail}</p>
    </div>
  );
}
