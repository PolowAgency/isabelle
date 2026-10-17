"use client";

import { Suspense } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { PurgeALaConnexion } from "@/components/offline/PurgeALaConnexion";
import { loginAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 bg-coral text-white font-medium rounded-xl py-3 text-base disabled:opacity-60 active:scale-[0.98] transition"
    >
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const fin = searchParams.get("fin");
  const expired = searchParams.get("expire") === "1" || fin === "expire";
  const infoFin =
    fin === "ailleurs"
      ? "Vous avez été déconnectée de tous vos appareils. Reconnectez-vous."
      : fin === "duree"
        ? "Pour votre sécurité, la session a expiré (3 jours). Reconnectez-vous."
        : fin === "mdp"
          ? "Mot de passe modifié. Reconnectez-vous avec le nouveau."
          : null;
  const [error, formAction] = useFormState(loginAction, null);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-pine px-6 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-semibold text-cream">
            Isabelle
          </h1>
          <p className="text-sage mt-1 text-sm">Tournée de l&apos;équipe</p>
        </div>

        <form
          action={formAction}
          className="bg-card rounded-2xl shadow-card p-6 flex flex-col gap-4"
        >
          {infoFin && (
            <div className="rounded-xl bg-pine/5 border border-pine/15 text-pine text-sm px-3 py-2">
              {infoFin}
            </div>
          )}
          {expired && (
            <div className="rounded-xl bg-coral/10 border border-coral/30 text-coral text-sm px-3 py-2">
              Votre accès temporaire est arrivé à échéance. Contactez
              l&apos;équipe.
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-pine/80">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-xl border border-pine/15 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-coral bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-pine/80">
              Mot de passe
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="rounded-xl border border-pine/15 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-coral bg-white"
            />
          </label>

          {error && <p className="text-coral text-sm">{error}</p>}

          <SubmitButton />
        </form>

        <p className="text-sage text-xs text-center mt-6">
          Pas d&apos;inscription libre — les comptes sont créés par
          l&apos;équipe.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <PurgeALaConnexion />
      <LoginForm />
    </Suspense>
  );
}
