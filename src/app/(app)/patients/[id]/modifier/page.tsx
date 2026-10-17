import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { NouveauPatientForm } from "@/components/patients/NouveauPatientForm";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { withSoignante } from "@/lib/db";
import { getAllSecteurs } from "@/lib/patients";
import { patients } from "@/lib/schema";
import { uuid } from "@/lib/validation";

export default async function ModifierPatientPage({ params }: { params: { id: string } }) {
  if (!uuid.safeParse(params.id).success) notFound();
  const current = await getCurrentSoignante();
  const [patient, secteurs] = await Promise.all([
    withSoignante(current.id, async (tx) => {
      const [row] = await tx.select().from(patients).where(eq(patients.id, params.id)).limit(1);
      return row ?? null;
    }),
    getAllSecteurs(current.id),
  ]);
  if (!patient) notFound();

  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="mb-2 font-serif text-2xl font-semibold text-pine">
        Modifier {patient.prenom} {patient.nom}
      </h1>
      <p className="mb-4 text-sm leading-6 text-pine/55">
        Identité, adresse, contact d&apos;urgence et médecin traitant. Les accès au domicile se
        modifient depuis la fiche.
      </p>
      <NouveauPatientForm
        secteurs={secteurs}
        patientId={patient.id}
        initial={{
          prenom: patient.prenom,
          nom: patient.nom,
          dateNaissance: patient.dateNaissance,
          telephone: patient.telephone,
          adresse: patient.adresse,
          complementAdresse: patient.complementAdresse,
          codePostal: patient.codePostal,
          ville: patient.ville,
          secteurId: patient.secteurId,
          contactUrgenceNom: patient.contactUrgenceNom,
          contactUrgenceTelephone: patient.contactUrgenceTelephone,
          contactUrgenceLien: patient.contactUrgenceLien,
          medecinTraitantNom: patient.medecinTraitantNom,
          medecinTraitantTelephone: patient.medecinTraitantTelephone,
        }}
      />
    </div>
  );
}
