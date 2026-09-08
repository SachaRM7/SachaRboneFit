import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeartPulse, ChevronDown } from "lucide-react";
import {
  LIBELLES_ETAT_RECUPERATION,
  resumeRecuperation,
  type RecuperationMusculaire,
} from "@/services/recuperation";

/**
 * Ce que le moteur sait déjà de la récupération, enfin montré.
 *
 * Le score existait, il décidait — `validerSeanceComplete` refuse une séance
 * sur `recuperation_insuffisante` — et l'athlète pouvait recevoir ce refus sans
 * jamais savoir quel muscle, depuis quand, ni pourquoi.
 *
 * CE COMPOSANT NE CALCULE RIEN. Il reçoit `RecuperationMusculaire`, déjà
 * assemblé par le service qui appelle le même `scoreRecuperation` que le
 * moteur. Recalculer un seuil ici aurait produit une seconde règle, invisible
 * depuis le moteur et divergente au premier ajustement — un test structurel
 * refuse d'ailleurs ce genre de copie.
 *
 * CE QU'ON MONTRE, ET CE QU'ON CACHE
 *
 * Les muscles qui demandent une décision : à ménager, en récupération, ou
 * travaillés dans la semaine. Les neutres sont comptés et masqués — quinze
 * lignes dont douze disent « prêt » ne se lisent pas, l'information utile s'y
 * noie. Le compte reste affiché pour que l'absence se distingue d'un calcul
 * manquant.
 *
 * Le détail — dernière sollicitation, séries, RIR, courbature — est replié dans
 * un `details` natif : il tient dans la carte sans l'allonger, et s'ouvre d'un
 * appui.
 */

const TEINTES: Record<string, string> = {
  pret: "text-encre-3",
  en_cours: "text-encre-2",
  a_menager: "text-perte",
};

export function CarteRecuperation({ etat }: { etat: RecuperationMusculaire }) {
  // Rien à dire : ni muscle en cours, ni contrainte, ni exposition récente.
  // Une carte vide n'apprendrait qu'une chose — que la carte existe.
  if (etat.muscles.length === 0) return null;

  return (
    <Card className="recovery-panel bg-carte border-filet">
      <CardHeader>
        <CardTitle className="text-encre-2 flex items-center gap-2">
          <HeartPulse className="w-4 h-4" />
          Récupération
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {etat.muscles.map((m) => (
          <details key={m.muscle} className="recovery-muscle group">
            <summary className="flex items-baseline justify-between gap-3 cursor-pointer list-none">
              <span className="text-encre text-sm flex items-center gap-2">
                <span
                  className={`recovery-dot recovery-${m.etat}`}
                  aria-hidden
                />
                {m.libelle}
              </span>
              <span
                className={`text-xs shrink-0 ${TEINTES[m.etat] ?? "text-encre-3"}`}
              >
                {LIBELLES_ETAT_RECUPERATION[m.etat]}{" "}
                <ChevronDown
                  size={12}
                  className="inline transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            {/* L'explication vient du service, qui la tient des motifs du
                moteur. Reformuler ici ferait diverger le texte de la règle. */}
            <p className="text-encre-3 text-xs mt-1 pl-0.5">
              {resumeRecuperation(m)}
            </p>
            {m.severiteContrainte !== null && (
              <p className="text-encre-3 text-xs pl-0.5">
                Zone ménagée à ta demande, sévérité {m.severiteContrainte}/10.
              </p>
            )}
          </details>
        ))}

        {etat.neutresMasques > 0 && (
          <p className="text-encre-3 text-xs pt-1">
            {etat.neutresMasques} autre{etat.neutresMasques > 1 ? "s" : ""}{" "}
            muscle
            {etat.neutresMasques > 1 ? "s" : ""} : rien à signaler.
          </p>
        )}

        {/*
          Un état d'entraînement, pas un diagnostic. La phrase le dit, parce
          qu'un tableau de statuts corporels se lit vite comme un bilan de
          santé — et ce n'en est pas un.
        */}
        <p className="text-encre-3 text-xs pt-1">
          Ce que l&apos;application propose de ménager. Ce n&apos;est pas un
          avis médical.
        </p>
      </CardContent>
    </Card>
  );
}
