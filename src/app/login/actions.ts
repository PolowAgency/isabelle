"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { isDemoModeEnabled } from "@/lib/demo-data";
import { verifierBlocage } from "@/lib/login";
import { ipDepuisEntetes } from "@/lib/login-guard";

const MESSAGE_ECHEC = "Email ou mot de passe incorrect.";

export async function loginAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return MESSAGE_ECHEC;
  }

  // Limitation des tentatives : même message de blocage quelle que soit
  // l'adresse saisie (un email inconnu est compté comme un autre).
  if (!isDemoModeEnabled()) {
    try {
      const etat = await verifierBlocage(email, ipDepuisEntetes(headers()));
      if (etat.bloque) return etat.message;
    } catch {
      // Compteurs indisponibles : Auth.js refera la vérification et refusera au besoin.
    }
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return MESSAGE_ECHEC;
    }
    throw error;
  }
}
