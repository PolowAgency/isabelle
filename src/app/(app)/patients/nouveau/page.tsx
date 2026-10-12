import { NouveauPatientForm } from "@/components/patients/NouveauPatientForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getAllSecteurs } from "@/lib/patients";

export default async function NouveauPatientPage() {
  const current = await getCurrentSoignante();
  const secteurs = await getAllSecteurs(current.id);

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">
        Nouveau patient
      </h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        Crée la fiche patient. Les infos d&apos;acces au domicile et les
        traitements se completent ensuite depuis la fiche.
      </p>

      <NouveauPatientForm secteurs={secteurs} />
    </div>
  );
}
