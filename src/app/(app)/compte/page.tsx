import Link from "next/link";
import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  FileSpreadsheet,
  ShieldCheck,
  UserPlus,
  Users2,
} from "lucide-react";
import { getCurrentSoignante } from "@/lib/current-soignante";
import {
  getEquipe,
  getMonthlyFigures,
  getTeamWorkload,
  isAdmin,
} from "@/lib/team";
import { getDisplayName, getInitiales } from "@/lib/team-format";
import { getWeekVisits } from "@/lib/week";
import { joursDeLaSemaine, lundiDe, todayISO } from "@/lib/date";
import { PlanningPrepCard } from "@/components/account/PlanningPrepCard";
import { TeamList } from "@/components/account/TeamList";
import { SignOutButton } from "@/components/account/SignOutButton";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { GestionComptes } from "@/components/account/GestionComptes";
import { SessionCard } from "@/components/account/SessionCard";
import { HorsLigneCard } from "@/components/offline/HorsLigneCard";
import { NotificationsCard } from "@/components/offline/NotificationsCard";
import { Avatar } from "@/components/ui/Avatar";

function formatCurrentMonthLabel() {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatWeekRange(startIso: string, endIso: string) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  });
  return `${formatter.format(new Date(`${startIso}T00:00:00`))} au ${formatter.format(
    new Date(`${endIso}T00:00:00`)
  )}`;
}

function formatDayMini(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

export default async function ComptePage() {
  const current = await getCurrentSoignante();
  const admin = isAdmin(current);
  const joursSemaine = joursDeLaSemaine(lundiDe(todayISO()));
  const [equipe, figures, workload, weekVisits] = await Promise.all([
    getEquipe(current.id),
    admin ? getMonthlyFigures(current.id) : Promise.resolve(null),
    admin ? getTeamWorkload(current.id) : Promise.resolve([]),
    admin ? getWeekVisits(current.id, joursSemaine[0], joursSemaine[6]) : Promise.resolve([]),
  ]);
  const weeklyPlanning = admin
    ? workload.map((item) => ({
        ...item,
        jours: joursSemaine.map((jour) => {
          const dayVisits = weekVisits.filter(
            (visit) => visit.soignanteId === item.soignanteId && visit.date === jour
          );
          return {
            jour,
            total: dayVisits.length,
            faites: dayVisits.filter((visit) => visit.statut === "faite").length,
          };
        }),
      }))
    : [];

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-4 font-serif text-2xl font-semibold text-pine">Compte</h1>

      <section className="rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
        <div className="flex items-center gap-4">
          <Avatar
            initiales={getInitiales(current.prenom, current.nom)}
            couleur={current.couleur}
            size={54}
          />
          <div>
            <p className="font-serif text-xl font-semibold text-ink">
              {getDisplayName(current)}
            </p>
            <p className="mt-1 text-sm text-pine/55">
              {current.role === "titulaire" ? "Titulaire" : "Remplaçante"}
            </p>
            <p className="text-sm text-pine/45">{current.email}</p>
          </div>
        </div>
      </section>

      <ChangePasswordForm />
      <SessionCard />
      <HorsLigneCard soignanteId={current.id} />
      <NotificationsCard />

      <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-pine">Équipe</h2>
            <p className="mt-1 text-sm text-pine/55">
              Titulaires et remplaçantes visibles pour toute soignante active.
            </p>
          </div>
          {admin ? (
            <Link
              href="/compte/nouvelle-remplacante"
              className="inline-flex items-center gap-1 rounded-full bg-coral px-3 py-2 text-sm font-semibold text-white"
            >
              <UserPlus size={16} />
              Ajouter
            </Link>
          ) : null}
        </div>

        <TeamList equipe={equipe} canManage={admin} />
      </section>

      {admin ? (
        <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-pine">
            <ShieldCheck size={18} />
            <div>
              <h2 className="font-serif text-xl font-semibold">Comptes et sécurité</h2>
              <p className="mt-1 text-sm text-pine/55">
                Droits d&apos;administration et mots de passe oubliés.
              </p>
            </div>
          </div>
          <GestionComptes equipe={equipe} moiId={current.id} />
          <Link
            href="/compte/journal"
            className="mt-3 flex items-center justify-between rounded-2xl border border-line/70 bg-cream px-4 py-3 text-sm font-medium text-pine"
          >
            Journal d&apos;activité
            <ChevronRight size={16} className="text-pine/35" />
          </Link>
        </section>
      ) : null}

      {admin && figures ? (
        <section className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-pine">
            <BarChart3 size={18} />
            <div>
              <h2 className="font-serif text-xl font-semibold">Administration</h2>
              <p className="mt-1 text-sm text-pine/55">
                Chiffres du mois de {formatCurrentMonthLabel()} et gestion des remplaçantes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AdminMetric label="Visites planifiées" value={figures.visitesPlanifiees} />
            <AdminMetric label="Visites faites" value={figures.visitesFaites} />
            <AdminMetric label="Absences" value={figures.visitesAbsentes} />
            <AdminMetric label="Reportées" value={figures.visitesReportees} />
            <AdminMetric label="Patients actifs" value={figures.patientsActifs} />
            <AdminMetric label="Remplaçantes actives" value={figures.remplacantesActives} />
          </div>

          <div className="mt-4 rounded-2xl bg-cream px-4 py-3">
            <div className="flex items-start gap-2">
              <Users2 size={16} className="mt-0.5 text-coral" />
              <div>
                <p className="text-sm font-semibold text-pine">Gestion équipe</p>
                <p className="mt-1 text-sm leading-6 text-pine/60">
                  Depuis cette zone, Isabelle peut ajouter une remplaçante et modifier
                  les dates, l&apos;email, l&apos;affectation ou l&apos;activation d&apos;une remplaçante existante.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-cream px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pine/35">
              Charge équipe
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {workload.map((item) => (
                <div
                  key={item.soignanteId}
                  className="rounded-2xl border border-line/70 bg-card px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.couleur }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {item.prenom} {item.nom}
                        </p>
                        <p className="text-xs text-pine/45">
                          {item.role === "titulaire" ? "Titulaire" : "Remplaçante"}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-pine">
                      {item.faites}/{item.planifiées}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-cream px-2 py-2 text-center text-pine">
                      <span className="block font-semibold">{item.faites}</span>
                      Faites
                    </div>
                    <div className="rounded-xl bg-cream px-2 py-2 text-center text-pine">
                      <span className="block font-semibold">{item.absentes}</span>
                      Absentes
                    </div>
                    <div className="rounded-xl bg-cream px-2 py-2 text-center text-pine">
                      <span className="block font-semibold">{item.reportees}</span>
                      Reportées
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-cream px-4 py-3">
            <div className="flex items-start gap-2">
              <CalendarRange size={16} className="mt-0.5 text-coral" />
              <div>
                <p className="text-sm font-semibold text-pine">Planning hebdo équipe</p>
                <p className="mt-1 text-sm text-pine/55">
                  Semaine du {formatWeekRange(joursSemaine[0], joursSemaine[6])}.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {weeklyPlanning.map((item) => (
                <div
                  key={item.soignanteId}
                  className="rounded-2xl border border-line/70 bg-card px-3 py-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.couleur }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {item.prenom} {item.nom}
                        </p>
                        <p className="text-xs text-pine/45">
                          {item.role === "titulaire" ? "Titulaire" : "Remplaçante"}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-pine/55">
                      {item.jours.reduce((sum, jour) => sum + jour.total, 0)} visites semaine
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {item.jours.map((jour) => (
                      <div
                        key={`${item.soignanteId}-${jour.jour}`}
                        className="rounded-xl bg-cream px-3 py-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pine/35">
                          {formatDayMini(jour.jour)}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {jour.total} prévue{jour.total > 1 ? "s" : ""}
                        </p>
                        <p className="mt-1 text-xs text-statut-faite">
                          {jour.faites} faite{jour.faites > 1 ? "s" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PlanningPrepCard weekStart={joursSemaine[0]} weekEnd={joursSemaine[6]} />
        </section>
      ) : null}

      <Link
        href="/compte/export"
        className="mt-4 flex items-center justify-between rounded-[24px] border border-line/80 bg-card p-4 shadow-card"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-pine">
          <FileSpreadsheet size={18} className="text-pine/55" />
          Journal des passages (export)
        </span>
        <ChevronRight size={18} className="text-pine/35" />
      </Link>

      <Link
        href="/compte/confidentialite"
        className="mt-4 flex items-center justify-between rounded-[24px] border border-line/80 bg-card p-4 shadow-card"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-pine">
          <ShieldCheck size={18} className="text-pine/55" />
          Confidentialite
        </span>
        <ChevronRight size={18} className="text-pine/35" />
      </Link>

      <div className="mt-4">
        <SignOutButton />
      </div>
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-cream px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pine/35">
        {label}
      </p>
      <p className="mt-2 font-serif text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}
