"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { definirAdminAction, reinitialiserMotDePasseAction } from "@/app/(app)/actions";
import { getDisplayName, getInitiales } from "@/lib/team-format";
import type { PublicSoignante } from "@/lib/schema";

/** Administration des comptes : droits d'admin et mot de passe temporaire (admin uniquement). */
export function GestionComptes({
  equipe,
  moiId,
}: {
  equipe: PublicSoignante[];
  moiId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [temporaire, setTemporaire] = useState<{ email: string; motDePasse: string } | null>(null);
  const [copie, setCopie] = useState(false);
  const comptes = equipe.filter((s) => s.actif);
  const nbAdmins = comptes.filter((s) => s.estAdmin).length;

  function basculerAdmin(cible: PublicSoignante) {
    setErreur(null);
    setMessage(null);
    startTransition(async () => {
      const res = await definirAdminAction(cible.id, !cible.estAdmin);
      if (!res.ok) setErreur(res.error);
      else setMessage(cible.estAdmin ? "Droits d'administration retirés." : "Droits d'administration accordés.");
      router.refresh();
    });
  }

  function reinitialiser(cible: PublicSoignante) {
    if (!window.confirm(`Réinitialiser le mot de passe de ${cible.prenom} ? Elle sera déconnectée de tous ses appareils.`)) {
      return;
    }
    setErreur(null);
    setMessage(null);
    setTemporaire(null);
    startTransition(async () => {
      const res = await reinitialiserMotDePasseAction(cible.id);
      if (!res.ok) setErreur(res.error);
      else setTemporaire(res.data);
    });
  }

  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 1800);
    } catch {
      setCopie(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {message && <p className="rounded-xl bg-statut-faite/10 px-3 py-2 text-sm text-statut-faite">{message}</p>}
      {erreur && (
        <p role="alert" className="rounded-xl bg-statut-absent/10 px-3 py-2 text-sm text-statut-absent">
          {erreur}
        </p>
      )}

      {temporaire && (
        <div className="rounded-2xl border border-coral/30 bg-cream px-4 py-3 text-sm text-pine">
          <p className="font-semibold">Mot de passe temporaire pour {temporaire.email}</p>
          <p className="mt-1 text-xs text-pine/60">
            Affiché une seule fois. À transmettre de vive voix : il devra être changé dès la
            première connexion.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-white px-3 py-2 font-mono text-base">{temporaire.motDePasse}</code>
            <button
              type="button"
              onClick={() => copier(temporaire.motDePasse)}
              className="inline-flex items-center gap-1 rounded-full bg-pine px-3 py-2 text-xs font-semibold text-cream"
            >
              <Copy size={14} /> {copie ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {comptes.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-line/70 bg-cream px-3 py-3">
          <div className="flex items-center gap-3">
            <Avatar initiales={getInitiales(s.prenom, s.nom)} couleur={s.couleur} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {getDisplayName(s)}
                {s.estAdmin && (
                  <span className="ml-2 rounded-full bg-pine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pine">
                    Admin
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-pine/55">{s.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.role === "titulaire" && (
              <button
                type="button"
                disabled={pending || (s.estAdmin && nbAdmins <= 1)}
                onClick={() => basculerAdmin(s)}
                title={s.estAdmin && nbAdmins <= 1 ? "Le dernier administrateur ne peut pas être retiré." : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-pine disabled:opacity-50"
              >
                <ShieldCheck size={14} />
                {s.estAdmin ? "Retirer admin" : "Rendre admin"}
              </button>
            )}
            {s.id !== moiId && (
              <button
                type="button"
                disabled={pending}
                onClick={() => reinitialiser(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-pine disabled:opacity-50"
              >
                <KeyRound size={14} /> Mot de passe oublié
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
