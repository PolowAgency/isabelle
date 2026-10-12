"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle } from "lucide-react";
import {
  createRemplacanteAction,
  updateRemplacanteAction,
} from "@/app/(app)/actions";
import { todayISO } from "@/lib/date";
import type { PublicSoignante } from "@/lib/schema";
import { getDisplayName } from "@/lib/team-format";

export function NouvelleRemplacanteForm({
  titulaires,
  initialValues,
  mode = "create",
}: {
  titulaires: PublicSoignante[];
  initialValues?: {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    remplaceId: string | null;
    dateDebut: string;
    dateFin: string | null;
    actif: boolean;
  };
  mode?: "create" | "edit";
}) {
  const router = useRouter();
  const [prenom, setPrenom] = useState(initialValues?.prenom ?? "");
  const [nom, setNom] = useState(initialValues?.nom ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [remplaceId, setRemplaceId] = useState(
    initialValues?.remplaceId ?? titulaires[0]?.id ?? ""
  );
  const [dateDebut, setDateDebut] = useState(initialValues?.dateDebut ?? todayISO());
  const [dateFin, setDateFin] = useState(initialValues?.dateFin ?? "");
  const [actif, setActif] = useState(initialValues?.actif ?? true);
  const [resultat, setResultat] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        if (mode === "create") {
          const created = await createRemplacanteAction({
            prenom,
            nom,
            email,
            remplaceId: remplaceId || null,
            dateDebut,
            dateFin: dateFin || null,
          });
          setResultat(created);
          return;
        }

        await updateRemplacanteAction({
          id: initialValues!.id,
          prenom,
          nom,
          email,
          remplaceId: remplaceId || null,
          dateDebut,
          dateFin: dateFin || null,
          actif,
        });
        router.push("/compte");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Creation impossible.");
      }
    });
  }

  if (resultat) {
    return (
      <div className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
        <p className="text-sm leading-6 text-pine">
          Compte cree pour <strong>{prenom} {nom}</strong>. Note bien ces identifiants
          maintenant : ils ne seront plus reaffiches ensuite.
        </p>

        <div className="mt-4 rounded-2xl bg-cream p-4">
          <p className="text-sm text-pine">
            <span className="text-pine/45">Email :</span> {resultat.email}
          </p>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-pine">
              <span className="text-pine/45">Mot de passe :</span>{" "}
              <span className="font-mono">{resultat.password}</span>
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(resultat.password);
                setCopied(true);
              }}
              className="rounded-full p-2 text-pine/55"
              aria-label="Copier le mot de passe"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/compte")}
          className="mt-4 w-full rounded-2xl bg-coral py-3.5 text-base font-semibold text-white"
        >
          Retour au compte
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Prenom</span>
            <input
              required
              value={prenom}
              onChange={(event) => setPrenom(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Nom</span>
            <input
              required
              value={nom}
              onChange={(event) => setNom(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-pine/80">Remplace</span>
          <select
            value={remplaceId}
            onChange={(event) => setRemplaceId(event.target.value)}
            className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
          >
            <option value="">Aucune titulaire precisee</option>
            {titulaires.map((titulaire) => (
              <option key={titulaire.id} value={titulaire.id}>
                {getDisplayName(titulaire)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Debut</span>
            <input
              type="date"
              required
              value={dateDebut}
              onChange={(event) => setDateDebut(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Fin</span>
            <input
              type="date"
              value={dateFin}
              onChange={(event) => setDateFin(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
          </label>
        </div>

        {mode === "edit" ? (
          <label className="flex items-center justify-between rounded-2xl border border-line bg-cream px-4 py-3">
            <span className="text-sm font-medium text-pine/80">Compte actif</span>
            <input
              type="checkbox"
              checked={actif}
              onChange={(event) => setActif(event.target.checked)}
              className="h-4 w-4 accent-pine"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {mode === "create" ? "Creer le compte" : "Enregistrer les modifications"}
        </button>
      </div>
    </form>
  );
}
