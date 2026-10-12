"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, X } from "lucide-react";
import type { Onboarding } from "@/lib/onboarding";
import { PASSWORD_FLAG } from "@/components/account/ChangePasswordForm";

const HIDE_FLAG = "isabelle-premiers-pas-masques";

type Step = {
  key: string;
  titre: string;
  detail: string;
  done: boolean;
  href?: string;
  onClick?: () => void;
};

export function PremiersPas({
  onboarding,
  prenom,
  admin,
  onPlanifier,
}: {
  onboarding: Onboarding;
  prenom: string;
  admin: boolean;
  onPlanifier: () => void;
}) {
  const [mdpChoisi, setMdpChoisi] = useState(false);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    try {
      setMdpChoisi(localStorage.getItem(PASSWORD_FLAG) === "1");
      setMasque(localStorage.getItem(HIDE_FLAG) === "1");
    } catch {
      // stockage indisponible : on affiche la carte
    }
  }, []);

  const steps: Step[] = [
    {
      key: "mdp",
      titre: "Choisir votre mot de passe",
      detail: "Remplacez le mot de passe provisoire reçu.",
      done: mdpChoisi,
      href: "/compte#mot-de-passe",
    },
    {
      key: "patients",
      titre: "Ajouter vos patients",
      detail: "Nom, adresse, secteur, accès au domicile. Les secteurs se créent au fil de l'eau.",
      done: onboarding.patients > 0,
      href: "/patients/nouveau",
    },
    {
      key: "visite",
      titre: "Planifier une première visite",
      detail: "Choisissez un patient, un passage (matin, midi, soir) et les soins.",
      done: onboarding.visites > 0,
      onClick: onPlanifier,
    },
    ...(admin
      ? [
          {
            key: "equipe",
            titre: "Inviter vos collègues",
            detail: "Chacune reçoit son propre compte et voit les mêmes patients.",
            done: onboarding.equipe > 1,
            href: "/compte/nouvelle-remplacante",
          },
        ]
      : []),
  ];

  const restantes = steps.filter((s) => !s.done).length;
  if (masque || restantes === 0) return null;

  return (
    <section className="mb-4 rounded-[24px] border border-coral/30 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-pine">Bienvenue {prenom}</h2>
          <p className="mt-0.5 text-sm text-pine/60">
            {steps.length - restantes} étape{steps.length - restantes > 1 ? "s" : ""} sur {steps.length} — voici
            comment démarrer.
          </p>
        </div>
        <button
          type="button"
          aria-label="Masquer le guide"
          onClick={() => {
            setMasque(true);
            try {
              localStorage.setItem(HIDE_FLAG, "1");
            } catch {
              // ignoré
            }
          }}
          className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-pine/40"
        >
          <X size={18} />
        </button>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step, index) => {
          const content = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? "bg-statut-faite text-white" : "bg-pine/10 text-pine"
                }`}
              >
                {step.done ? <Check size={15} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span
                  className={`block text-sm font-semibold ${
                    step.done ? "text-pine/45 line-through" : "text-ink"
                  }`}
                >
                  {step.titre}
                </span>
                {!step.done && <span className="block text-xs text-pine/55">{step.detail}</span>}
              </span>
              {!step.done && <ChevronRight size={16} className="shrink-0 text-pine/35" />}
            </>
          );
          const cls = "flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5";
          if (step.done) return <li key={step.key} className={cls}>{content}</li>;
          return (
            <li key={step.key}>
              {step.href ? (
                <Link href={step.href} className={cls}>{content}</Link>
              ) : (
                <button type="button" onClick={step.onClick} className={`${cls} w-full`}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
