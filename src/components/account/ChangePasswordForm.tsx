"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { changerMotDePasseAction } from "@/app/(app)/actions";

export const PASSWORD_FLAG = "isabelle-mdp-choisi";

const inputClass =
  "h-12 rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

export function ChangePasswordForm({ obligatoire = false }: { obligatoire?: boolean }) {
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (nouveau !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    startTransition(async () => {
      const result = await changerMotDePasseAction(actuel, nouveau);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        localStorage.setItem(PASSWORD_FLAG, "1");
      } catch {
        // stockage indisponible : la carte « Premiers pas » restera simplement affichée
      }
      setDone(true);
      setActuel("");
      setNouveau("");
      setConfirmation("");
      // Les sessions ouvertes sont invalidées par le changement : reconnexion avec le nouveau mot de passe.
      window.setTimeout(() => window.location.assign("/api/session-expiree?motif=mdp"), 1500);
    });
  }

  return (
    <section
      id="mot-de-passe"
      className="mt-4 rounded-[24px] border border-line/80 bg-card p-4 shadow-card"
    >
      <div className="mb-3 flex items-center gap-2 text-pine">
        <KeyRound size={18} />
        <h2 className="font-serif text-xl font-semibold">
          {obligatoire ? "Choisissez votre mot de passe" : "Mot de passe"}
        </h2>
      </div>
      {obligatoire && (
        <p className="mb-3 text-sm text-pine/60">
          Votre mot de passe est provisoire : choisissez-en un nouveau pour continuer. Saisissez
          d&apos;abord le mot de passe provisoire reçu.
        </p>
      )}

      {done ? (
        <p className="flex items-center gap-2 rounded-2xl bg-statut-faite/10 px-4 py-3 text-sm font-medium text-statut-faite">
          <Check size={16} /> Mot de passe modifié. Reconnexion…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Mot de passe actuel</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={actuel}
              onChange={(e) => setActuel(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">
              Nouveau mot de passe <span className="text-pine/40">(10 caractères minimum)</span>
            </span>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-pine/80">Confirmer</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className={inputClass}
            />
          </label>
          {error ? <p className="text-sm text-coral">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
            Changer mon mot de passe
          </button>
        </form>
      )}
    </section>
  );
}
