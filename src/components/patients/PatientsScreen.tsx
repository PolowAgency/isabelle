"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { PatientListItem } from "@/components/patients/PatientListItem";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PatientListItemData, PatientListSector } from "@/lib/patients";

type FilterValue = string | "tous" | "sans-secteur";

export function PatientsScreen({
  patients,
  secteurs,
}: {
  patients: PatientListItemData[];
  secteurs: PatientListSector[];
}) {
  const [query, setQuery] = useState("");
  const [selectedSecteur, setSelectedSecteur] = useState<FilterValue>("tous");

  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesSecteur =
        selectedSecteur === "tous"
          ? true
          : selectedSecteur === "sans-secteur"
            ? patient.secteurId === null
            : patient.secteurId === selectedSecteur;

      if (!matchesSecteur) return false;
      if (!normalizedQuery) return true;

      return [
        patient.prenom,
        patient.nom,
        patient.adresse,
        patient.ville,
        patient.secteurNom,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [patients, query, selectedSecteur]);

  const filters = [
    { value: "tous" as const, label: `Tous (${patients.length})`, color: "#25453a" },
    ...secteurs.map((secteur) => ({
      value: secteur.id as FilterValue,
      label: `${secteur.nom} (${secteur.count})`,
      color: secteur.couleur,
    })),
    { value: "sans-secteur" as const, label: "Sans secteur", color: "#d8cfba" },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 px-4 pb-3 pt-4 backdrop-blur-sm">
        <div className="mb-3">
          <h1 className="font-serif text-2xl font-semibold text-pine">Patients</h1>
          <p className="mt-1 text-sm text-pine/55">
            {filteredPatients.length} patient{filteredPatients.length > 1 ? "s" : ""} visible
            {filteredPatients.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="relative mb-3">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-pine/35"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par nom, adresse ou secteur"
            className="h-12 w-full rounded-2xl border border-line bg-card pl-10 pr-4 text-base text-ink outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/20"
          />
        </div>

        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
          <div className="flex gap-2 pb-1">
            {filters.map((filter) => {
              const active = selectedSecteur === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedSecteur(filter.value)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition ${
                    active ? "text-white shadow-card" : "border-line bg-card text-pine/70"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: filter.color,
                          borderColor: filter.color,
                        }
                      : undefined
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="px-4 pb-24 pt-4">
        {filteredPatients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun patient trouvé"
            description={
              query || selectedSecteur !== "tous"
                ? "Essaie avec un autre nom ou enlève un filtre de secteur."
                : "Aucun patient actif n'est disponible pour le moment."
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredPatients.map((patient) => (
              <PatientListItem key={patient.id} patient={patient} />
            ))}
          </div>
        )}
      </div>

      <Link
        href="/patients/nouveau"
        aria-label="Nouveau patient"
        className="fixed right-5 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-lg transition active:scale-95"
      >
        <Plus size={26} />
      </Link>
    </div>
  );
}
