import { notFound } from "next/navigation";
import { FichePatientScreen } from "@/components/patient/FichePatientScreen";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getPatientDetail } from "@/lib/patient-detail";

export default async function FichePatientPage({
  params,
}: {
  params: { id: string };
}) {
  const current = await getCurrentSoignante();
  const data = await getPatientDetail(current.id, params.id);

  if (!data) notFound();

  return <FichePatientScreen {...data} />;
}
