"use client";
import Link from "next/link";
import { Dumbbell, MapPin, Wrench, Ruler, CheckCircle2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { EtatDuJour, NomEtat } from "@/lib/engine/etat-du-jour";

/**
 * La seule carte qui compte à l'ouverture de l'application.
 *
 * Elle a toujours quelque chose à dire. L'écran affichait « Aucune séance
 * programmée » dès que le moteur ne trouvait pas de gabarit — un constat, pas
 * une proposition. Ici, chaque état porte sa prochaine étape, et l'état
 * lui-même vient du moteur : cet écran ne décide de rien, il présente.
 */

interface Formulation {
  icone: typeof Dumbbell;
  titre: (e: EtatDuJour) => string;
  texte: string;
  bouton: string;
}

const FORMULATIONS: Record<NomEtat, Formulation> = {
  sans_salle: {
    icone: MapPin,
    titre: () => "Où t'entraînes-tu ?",
    texte: "Je ne peux rien préparer tant que je ne sais pas de quel matériel tu disposes.",
    bouton: "Choisir ma salle",
  },
  salle_vide: {
    icone: Wrench,
    titre: (e) => `${e.salle?.nom ?? "Ta salle"} — à renseigner`,
    texte:
      "Dis-moi ce qu'on peut faire ici : appareils, barres, haltères, barre de traction. Chaque exercice ajouté est un exercice que je peux te proposer.",
    bouton: "Renseigner la salle",
  },
  calibration: {
    icone: Ruler,
    titre: (e) => (e.seance ? `Séance ${e.seance.lettre} — calibration` : "Ta première séance"),
    texte:
      "On ne cherche pas la performance aujourd'hui, on mesure. Après chaque série, tu diras combien tu aurais pu en faire de plus — c'est ce qui me permettra de fixer tes charges.",
    bouton: "Commencer",
  },
  prete: {
    icone: Dumbbell,
    titre: (e) => (e.seance ? `Séance ${e.seance.lettre}` : "Séance du jour"),
    texte: "",
    bouton: "Commencer ma séance",
  },
  deja_entraine: {
    icone: CheckCircle2,
    titre: () => "C'est fait pour aujourd'hui",
    texte: "Séance enregistrée. La récupération fait partie du travail, pas une pause dedans.",
    bouton: "Voir ma progression",
  },
  semaine_complete: {
    icone: TrendingUp,
    titre: () => "Semaine complète",
    texte: "Tu as atteint le rythme que tu t'es fixé. Rien ne t'empêche d'y retourner, mais rien ne l'exige.",
    bouton: "Voir ma progression",
  },
};

export function CarteAujourdhui({ etat }: { etat: EtatDuJour }) {
  const f = FORMULATIONS[etat.etat];
  const Icone = f.icone;

  // La séance prête n'a pas de discours à tenir : son nom et sa salle suffisent.
  const texte =
    etat.etat === "prete"
      ? [etat.seance?.nom, etat.salle?.nom].filter(Boolean).join(" — ")
      : f.texte;

  return (
    <Card
      className={
        etat.enAttenteDeDonnees
          ? "bg-carte border-filet"
          : "bg-carte border-encre/20 shadow-sm"
      }
    >
      <CardContent className="py-5 space-y-4">
        <div className="flex items-start gap-3">
          <Icone className="w-5 h-5 mt-0.5 shrink-0 text-encre-2" aria-hidden />
          <div className="space-y-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-encre-3">Aujourd&apos;hui</p>
            <h2 className="text-xl font-bold text-encre leading-tight">{f.titre(etat)}</h2>
            {texte && <p className="text-encre-2 text-sm leading-relaxed">{texte}</p>}
          </div>
        </div>

        <Link
          href={etat.action.href}
          className={buttonVariants({
            className: "w-full h-11 text-base bg-encre text-papier hover:bg-filet",
          })}
        >
          {f.bouton}
        </Link>
      </CardContent>
    </Card>
  );
}
