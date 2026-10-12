import { PatientsScreen } from "@/components/patients/PatientsScreen";
import { getCurrentSoignante } from "@/lib/current-soignante";
import { getPatientsList } from "@/lib/patients";

export default async function PatientsPage() {
  const current = await getCurrentSoignante();
  const data = await getPatientsList(current.id);

  return <PatientsScreen {...data} />;
}
