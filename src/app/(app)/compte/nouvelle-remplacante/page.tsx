import { redirect } from "next/navigation";
import { NouvelleRemplacanteForm } from "@/components/account/NouvelleRemplacanteForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getTitulairesActives, isIsabelleAdmin } from "@/lib/team";

export default async function NouvelleRemplacantePage() {
  const current = await getCurrentSoignante();
  if (!isIsabelleAdmin(current)) {
    redirect("/compte");
  }

  const titulaires = await getTitulairesActives(current.id);

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">
        Ajouter une collègue
      </h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        Crée un compte avec un mot de passe généré automatiquement, à transmettre à la personne.
      </p>

      <NouvelleRemplacanteForm titulaires={titulaires} />
    </div>
  );
}
