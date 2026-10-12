"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { creerPatientAction, creerSecteurAction } from "@/app/(app)/actions";
import type { SecteurOption } from "@/lib/patients";

const NOUVEAU_SECTEUR = "__nouveau__";

const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-cream px-4 text-base text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

export function NouveauPatientForm({ secteurs }: { secteurs: SecteurOption[] }) {
  const router = useRouter();
  const [secteurOptions, setSecteurOptions] = useState(secteurs);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [complementAdresse, setComplementAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [secteurId, setSecteurId] = useState("");
  const [nouveauSecteurNom, setNouveauSecteurNom] = useState("");
  const [contactUrgenceNom, setContactUrgenceNom] = useState("");
  const [contactUrgenceTelephone, setContactUrgenceTelephone] = useState("");
  const [contactUrgenceLien, setContactUrgenceLien] = useState("");
  const [medecinTraitantNom, setMédecinTraitantNom] = useState("");
  const [medecinTraitantTelephone, setMédecinTraitantTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creatingSecteur, startCreatingSecteur] = useTransition();

  const showNouveauSecteur = secteurId === NOUVEAU_SECTEUR;

  function handleCreerSecteur() {
    const trimmed = nouveauSecteurNom.trim();
    if (!trimmed) return;
    setError(null);

    startCreatingSecteur(async () => {
      try {
        const created = await creerSecteurAction(trimmed);
        setSecteurOptions((current) => [...current, created]);
        setSecteurId(created.id);
        setNouveauSecteurNom("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de creer le secteur.");
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (showNouveauSecteur) {
      setError("Cree d'abord le secteur ou choisis-en un existant.");
      return;
    }

    startTransition(async () => {
      try {
        const created = await creerPatientAction({
          prenom,
          nom,
          dateNaissance: dateNaissance || null,
          telephone: telephone || null,
          adresse: adresse || null,
          complementAdresse: complementAdresse || null,
          codePostal: codePostal || null,
          ville: ville || null,
          secteurId: secteurId || null,
          contactUrgenceNom: contactUrgenceNom || null,
          contactUrgenceTelephone: contactUrgenceTelephone || null,
          contactUrgenceLien: contactUrgenceLien || null,
          medecinTraitantNom: medecinTraitantNom || null,
          medecinTraitantTelephone: medecinTraitantTelephone || null,
        });
        router.push(`/patients/${created.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Creation impossible.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Section title="Identité">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <input
              required
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Nom">
            <input
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Date de naissance">
          <input
            type="date"
            value={dateNaissance}
            onChange={(e) => setDateNaissance(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Téléphone">
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Adresse">
        <Field label="Adresse">
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Complément (étage, bâtiment…)">
          <input
            value={complementAdresse}
            onChange={(e) => setComplementAdresse(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code postal">
            <input
              value={codePostal}
              onChange={(e) => setCodePostal(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ville">
            <input value={ville} onChange={(e) => setVille(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Secteur">
          <select
            value={secteurId}
            onChange={(e) => setSecteurId(e.target.value)}
            className={inputClass}
          >
            <option value="">Sans secteur</option>
            {secteurOptions.map((secteur) => (
              <option key={secteur.id} value={secteur.id}>
                {secteur.nom}
              </option>
            ))}
            <option value={NOUVEAU_SECTEUR}>+ Nouveau secteur…</option>
          </select>
        </Field>

        {showNouveauSecteur ? (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-cream p-3">
            <input
              autoFocus
              placeholder="Nom du secteur"
              value={nouveauSecteurNom}
              onChange={(e) => setNouveauSecteurNom(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            />
            <button
              type="button"
              disabled={creatingSecteur || !nouveauSecteurNom.trim()}
              onClick={handleCreerSecteur}
              className="inline-flex h-11 items-center gap-1 rounded-xl bg-pine px-3 text-sm font-semibold text-cream disabled:opacity-50"
            >
              {creatingSecteur ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              Créer
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Contact d'urgence">
        <Field label="Nom">
          <input
            value={contactUrgenceNom}
            onChange={(e) => setContactUrgenceNom(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone">
            <input
              type="tel"
              value={contactUrgenceTelephone}
              onChange={(e) => setContactUrgenceTelephone(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Lien">
            <input
              placeholder="Fille, voisin..."
              value={contactUrgenceLien}
              onChange={(e) => setContactUrgenceLien(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Médecin traitant">
        <Field label="Nom">
          <input
            value={medecinTraitantNom}
            onChange={(e) => setMédecinTraitantNom(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Téléphone">
          <input
            type="tel"
            value={medecinTraitantTelephone}
            onChange={(e) => setMédecinTraitantTelephone(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
        Créer le patient
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-line/80 bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-pine/45">
        {title}
      </h2>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-pine/80">{label}</span>
      {children}
    </label>
  );
}
