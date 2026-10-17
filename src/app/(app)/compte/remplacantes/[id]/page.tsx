import { notFound, redirect } from "next/navigation";
import { NouvelleRemplacanteForm } from "@/components/account/NouvelleRemplacanteForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import {
  getRemplacanteById,
  getTitulairesActives,
  isAdmin,
} from "@/lib/team";

export default async function EditRemplacantePage({
  params,
}: {
  params: { id: string };
}) {
  const current = await getCurrentSoignante();
  if (!isAdmin(current)) {
    redirect("/compte");
  }

  const [titulaires, remplacante] = await Promise.all([
    getTitulairesActives(current.id),
    getRemplacanteById(current.id, params.id),
  ]);

  if (!remplacante) {
    notFound();
  }

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">
        Modifier une remplacante
      </h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        Mise a jour des informations, des dates et de l&apos;activation du compte.
      </p>

      <NouvelleRemplacanteForm
        titulaires={titulaires}
        mode="edit"
        initialValues={{
          id: remplacante.id,
          prenom: remplacante.prenom,
          nom: remplacante.nom,
          email: remplacante.email,
          remplaceId: remplacante.remplaceId,
          dateDebut: remplacante.dateDebut,
          dateFin: remplacante.dateFin,
          actif: remplacante.actif,
        }}
      />
    </div>
  );
}
