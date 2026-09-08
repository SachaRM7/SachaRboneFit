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

export function CarteRecuperation({ etat }: { etat: RecuperationMusculaire }) {
  // Rien à dire : ni muscle en cours, ni contrainte, ni exposition récente.
  // Une carte vide n'apprendrait qu'une chose — que la carte existe.
  if (etat.muscles.length === 0) return null;

  const groupes = [
    { cle: "a_menager", titre: LIBELLES_ETAT_RECUPERATION.a_menager },
    { cle: "en_cours", titre: LIBELLES_ETAT_RECUPERATION.en_cours },
    { cle: "pret", titre: LIBELLES_ETAT_RECUPERATION.pret },
  ] as const;
  return (
    <Card className="recovery-panel bg-carte border-filet">
      <CardHeader>
        <CardTitle className="text-encre-2 flex items-center gap-2">
          <HeartPulse className="w-4 h-4" />
          Ton état musculaire
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="recovery-counts">
          {groupes.map((g) => (
            <div key={g.cle} className={`recovery-count recovery-${g.cle}`}>
              <strong>
                {etat.muscles.filter((m) => m.etat === g.cle).length}
              </strong>
              <span>{g.titre}</span>
            </div>
          ))}
        </div>
        {groupes.map((g) => {
          const muscles = etat.muscles.filter((m) => m.etat === g.cle);
          if (!muscles.length) return null;
          return (
            <details
              key={g.cle}
              id={`muscles-${g.cle}`}
              className="recovery-group"
              open={g.cle === "a_menager"}
            >
              <summary>
                <span>
                  <span
                    className={`recovery-dot recovery-${g.cle}`}
                    aria-hidden
                  />
                  {g.titre}
                </span>
                <span>
                  {muscles.length} <ChevronDown size={14} aria-hidden />
                </span>
              </summary>
              <div className="recovery-chips">
                {muscles.map((m) => (
                  <details key={m.muscle} className="recovery-muscle">
                    <summary>
                      {m.libelle}
                      <ChevronDown size={12} aria-hidden />
                    </summary>
                    <p>{resumeRecuperation(m)}</p>
                    {m.severiteContrainte !== null && (
                      <p>
                        Zone ménagée à ta demande, sévérité{" "}
                        {m.severiteContrainte}/10.
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </details>
          );
        })}

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
