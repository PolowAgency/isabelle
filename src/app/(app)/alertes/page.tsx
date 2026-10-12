import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  ChevronRight,
  MessageSquareWarning,
  TriangleAlert,
} from "lucide-react";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getAlerts } from "@/lib/alerts";
import { formatDateLong, todayISO } from "@/lib/date";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`)
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AlertesPage() {
  const current = await getCurrentSoignante();
  const alerts = await getAlerts(current.id);
  const totalAlertes =
    alerts.ordonnances.length + alerts.transmissions.length + alerts.visites.length;

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">Alertes</h1>
      <p className="mb-4 text-sm text-pine/55">
        Ordonnances a renouveler, urgences non lues et visites d&apos;hier encore prevues.
      </p>

      <section className="mb-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pine/35">
              Priorités du {formatDateLong(todayISO())}
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-pine">
              {totalAlertes} alerte{totalAlertes > 1 ? "s" : ""} active{totalAlertes > 1 ? "s" : ""}
            </h2>
            <p className="mt-1 text-sm text-pine/55">
              Ouvrez un patient, relisez la transmission, puis revenez ici pour continuer.
            </p>
          </div>

          <Link
            href="/?passage=matin&vue=equipe"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pine px-3 py-2 text-sm font-semibold text-cream"
          >
            Voir la tournée
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <AlertSummary label="Ordonnances" value={alerts.ordonnances.length} tone="warning" />
          <AlertSummary label="Urgentes" value={alerts.transmissions.length} tone="alert" />
          <AlertSummary label="Non clôturées" value={alerts.visites.length} tone="neutral" />
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-pine">
            <CalendarClock size={18} />
            <h2 className="font-serif text-xl font-semibold">Ordonnances &lt; 30 jours</h2>
          </div>

          {alerts.ordonnances.length === 0 ? (
            <p className="text-sm text-pine/45">Aucune ordonnance proche de l&apos;expiration.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.ordonnances.map((alert) => (
                <Link
                  key={alert.id}
                  href={`/patients/${alert.patientId}`}
                  className="rounded-2xl border border-line/70 bg-cream px-4 py-3 transition hover:border-pine/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {alert.patientPrenom} {alert.patientNom}
                      </p>
                      <p className="mt-1 text-xs text-pine/55">
                        Echeance : {formatDate(alert.dateFin)}
                      </p>
                      <p className="mt-1 text-xs text-pine/45">
                        {alert.prescripteur ?? "Prescripteur non renseigné"}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-pine/35" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-pine">
            <MessageSquareWarning size={18} />
            <h2 className="font-serif text-xl font-semibold">Urgentes non lues</h2>
          </div>

          {alerts.transmissions.length === 0 ? (
            <p className="text-sm text-pine/45">Aucune transmission urgente non lue.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.transmissions.map((alert) => (
                <Link
                  key={alert.id}
                  href={`/patients/${alert.patientId}`}
                  className="rounded-2xl border border-line/70 bg-cream px-4 py-3 transition hover:border-pine/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-semibold text-coral">
                          Urgent
                        </span>
                        <p className="text-sm font-semibold text-ink">
                          {alert.patientPrenom} {alert.patientNom}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-pine/70">{alert.contenu}</p>
                      <p className="mt-2 text-xs text-pine/45">
                        {alert.soignantePrenom} {alert.soignanteNom} · {formatDateTime(alert.createdAt)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-pine/35" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-pine">
            <TriangleAlert size={18} />
            <h2 className="font-serif text-xl font-semibold">Visites d&apos;hier non cloturees</h2>
          </div>

          {alerts.visites.length === 0 ? (
            <p className="text-sm text-pine/45">Aucune visite de la veille encore au statut prevue.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.visites.map((alert) => (
                <Link
                  key={alert.id}
                  href={`/patients/${alert.patientId}`}
                  className="rounded-2xl border border-line/70 bg-cream px-4 py-3 transition hover:border-pine/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {alert.patientPrenom} {alert.patientNom}
                      </p>
                      <p className="mt-1 text-xs text-pine/55">
                        {formatDate(alert.date)} · {alert.passage} · {alert.soignantePrenom} {alert.soignanteNom}
                      </p>
                      <p className="mt-1 text-xs text-pine/45">
                        À vérifier avant de clôturer la journée.
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-pine/35" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {alerts.ordonnances.length === 0 &&
      alerts.transmissions.length === 0 &&
      alerts.visites.length === 0 ? (
        <div className="mt-4 rounded-[24px] border border-line/80 bg-card p-6 text-center shadow-card">
          <BellRing size={22} className="mx-auto text-pine/40" />
          <p className="mt-2 text-sm text-pine/55">Aucune alerte active.</p>
        </div>
      ) : null}
    </div>
  );
}

function AlertSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "alert" | "neutral";
}) {
  const toneClasses =
    tone === "warning"
      ? "bg-[#c9954a]/15 text-[#8b6117]"
      : tone === "alert"
        ? "bg-coral/15 text-coral"
        : "bg-pine/10 text-pine";

  return (
    <div className="rounded-2xl border border-line/70 bg-cream px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pine/35">
        {label}
      </p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses}`}>
        {value}
      </p>
    </div>
  );
}
