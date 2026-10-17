"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { creerTransfertAction } from "@/app/(app)/actions";
import { useSoignanteContext } from "@/lib/soignante-context";
import { todayISO } from "@/lib/date";
import type { CibleTransfert } from "@/lib/transferts";

export type ChoixTransfert = { libelle: string; cible: CibleTransfert };

/**
 * Choix de la collègue destinataire d'un transfert. `choix` propose une ou
 * plusieurs portées (ex. « cette visite » ou « toute la série »).
 */
export function TransfertSheet({
  titre,
  choix,
  onClose,
  onDone,
}: {
  titre: string;
  choix: ChoixTransfert[] | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const { current, equipe } = useSoignanteContext();
  const [portee, setPortee] = useState(0);
  const [destinataire, setDestinataire] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setPortee(0);
    setDestinataire(null);
    setMessage("");
    setErreur(null);
  }, [choix]);

  const aujourdhui = todayISO();
  const collegues = equipe.filter(
    (s) => s.id !== current.id && s.actif && (!s.dateFin || s.dateFin >= aujourdhui)
  );
  const selection = choix?.[portee];

  function envoyer() {
    if (!selection || !destinataire) return;
    setErreur(null);
    startTransition(async () => {
      const res = await creerTransfertAction({
        cible: selection.cible,
        versSoignanteId: destinataire,
        message,
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      const prenom = collegues.find((c) => c.id === destinataire)?.prenom ?? "ta collègue";
      onDone(`Demande envoyée à ${prenom}. Elle doit l'accepter pour que les visites lui passent.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <BottomSheet open={choix !== null} onClose={onClose} title={titre}>
      <div className="flex flex-col gap-4 pb-2">
        {choix && choix.length > 1 && (
          <div className="flex flex-col gap-1.5">
            {choix.map((c, i) => (
              <label
                key={c.libelle}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                  portee === i ? "border-pine bg-pine/5 text-pine" : "border-line text-pine/70"
                }`}
              >
                <input
                  type="radio"
                  name="portee-transfert"
                  checked={portee === i}
                  onChange={() => setPortee(i)}
                  className="accent-[#25453a]"
                />
                {c.libelle}
              </label>
            ))}
          </div>
        )}
        {choix && choix.length === 1 && (
          <p className="text-sm text-pine/70">{choix[0].libelle}</p>
        )}

        <div>
          <p className="text-sm font-medium text-pine/80 mb-1.5">Transférer à</p>
          {collegues.length === 0 ? (
            <p className="text-sm text-pine/50">Aucune autre soignante active.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {collegues.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDestinataire(c.id)}
                  aria-pressed={destinataire === c.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
                    destinataire === c.id ? "border-pine bg-pine/5" : "border-line"
                  }`}
                >
                  <Avatar
                    initiales={`${c.prenom[0] ?? ""}${c.nom[0] ?? ""}`.toUpperCase()}
                    couleur={c.couleur}
                    size={30}
                  />
                  <span className="font-medium text-pine">
                    {c.prenom} {c.nom}
                  </span>
                  {c.role === "remplacante" && (
                    <span className="text-xs text-pine/45">remplaçante</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-pine/80">Message (facultatif)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex. : je suis absente la semaine prochaine"
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coral"
          />
        </label>

        <p className="text-xs text-pine/50">
          Les visites futures « prévues » passent à ta collègue quand elle accepte. Les visites déjà
          faites ne changent pas.
        </p>

        {erreur && (
          <p role="alert" className="text-sm text-statut-absent">
            {erreur}
          </p>
        )}

        <button
          onClick={envoyer}
          disabled={pending || !destinataire}
          className="bg-coral text-white font-medium rounded-xl py-3 text-base disabled:opacity-60"
        >
          {pending ? "Envoi…" : "Envoyer la demande"}
        </button>
      </div>
    </BottomSheet>
  );
}
