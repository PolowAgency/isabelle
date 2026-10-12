import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function ConfidentialitePage() {
  return (
    <div className="px-4 pt-4 pb-10 safe-top">
      <Link
        href="/compte"
        className="flex items-center gap-1 text-pine/60 text-sm mb-4"
      >
        <ChevronLeft size={18} /> Retour
      </Link>

      <h1 className="font-serif text-2xl font-semibold text-pine mb-4">
        Confidentialité &amp; données de santé
      </h1>

      <div className="bg-card rounded-2xl shadow-card p-5 flex flex-col gap-4 text-sm text-pine/80 leading-relaxed">
        <p>
          Cette application manipule des données de santé (motifs de soins,
          traitements, ordonnances, photos de plaies), une catégorie de
          données particulièrement protégée par le RGPD.
        </p>

        <div>
          <h2 className="font-serif text-base font-semibold text-pine mb-1">
            Ce qui est mis en place
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Accès réservé à l&apos;équipe : chaque compte est créé
              manuellement, aucune inscription libre.
            </li>
            <li>
              Cloisonnement strict des données via des règles au niveau base
              de données (RLS) : aucun accès public, aucun lien partageable.
            </li>
            <li>
              Documents et photos stockés dans des espaces privés, accessibles
              uniquement via des liens signés à durée limitée.
            </li>
            <li>
              Comptes temporaires des remplaçantes désactivés automatiquement
              à la date de fin renseignée.
            </li>
            <li>Aucune donnée de santé n&apos;est journalisée en clair.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-serif text-base font-semibold text-pine mb-1">
            Limite importante
          </h2>
          <p>
            Cette version est un outil interne à l&apos;équipe, non
            commercialisé. L&apos;hébergement (Supabase standard) n&apos;est{" "}
            <strong>pas certifié Hébergeur de Données de Santé (HDS)</strong>.
            Si l&apos;application évolue vers un usage commercial ou à plus
            grande échelle, un hébergement certifié HDS deviendra
            obligatoire.
          </p>
        </div>
      </div>
    </div>
  );
}
