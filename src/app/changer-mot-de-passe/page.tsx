import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { redirect } from "next/navigation";

// Hors du groupe (app) : pas de barre de navigation tant que le mot de passe est provisoire.
export default async function ChangerMotDePassePage() {
  const current = await getCurrentSoignante({ autoriserMotDePasseTemporaire: true });
  if (!current.mustChangePassword) redirect("/");

  return (
    <div className="min-h-dvh bg-cream px-4 pb-10 pt-8 safe-top">
      <h1 className="font-serif text-2xl font-semibold text-pine">Bienvenue {current.prenom}</h1>
      <ChangePasswordForm obligatoire />
    </div>
  );
}
