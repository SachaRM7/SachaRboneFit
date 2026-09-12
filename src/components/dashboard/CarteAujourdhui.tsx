"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Dumbbell,
  MapPin,
  Wrench,
  Ruler,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import type { EtatDuJour, NomEtat } from "@/lib/engine/etat-du-jour";
import { DetailsAccueil } from "./DetailsAccueil";

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
    texte:
      "Je ne peux rien préparer tant que je ne sais pas de quel matériel tu disposes.",
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
    titre: (e) =>
      e.seance
        ? `Séance ${e.seance.lettre}`
        : "Ta première séance",
    texte:
      "On mesure tes premières charges. Après chaque série, indique combien de répétitions tu aurais pu faire en plus.",
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
    texte:
      "Séance enregistrée. La récupération fait partie du travail, pas une pause dedans.",
    bouton: "Voir ton évolution",
  },
  semaine_complete: {
    icone: TrendingUp,
    titre: () => "Semaine complète",
    texte:
      "Tu as atteint le rythme que tu t'es fixé. Rien ne t'empêche d'y retourner, mais rien ne l'exige.",
    bouton: "Voir ton évolution",
  },
};

export function CarteAujourdhui({ etat }: { etat: EtatDuJour }) {
  const f = FORMULATIONS[etat.etat];
  const Icone = f.icone;
  const aFaire = etat.etat === "calibration" || etat.etat === "prete";
  const faite = etat.etat === "deja_entraine" || etat.etat === "semaine_complete";
  return (
    <section className="home-session" aria-labelledby="session-du-jour">
      <div className="home-session-top">
        <p className="home-eyebrow">{aFaire ? "Prochaine séance" : faite ? "Bien joué" : "Pour commencer"}</p>
        <Icone size={22} strokeWidth={1.5} aria-hidden />
      </div>
      {aFaire && etat.seance ? (
        <Link href="/programme" prefetch={false} className="home-session-title" aria-label={`Voir dans le programme la séance ${etat.seance.lettre}`}>
          <h2 id="session-du-jour">{f.titre(etat)}</h2><ArrowRight size={22} aria-hidden />
        </Link>
      ) : <h2 id="session-du-jour">{f.titre(etat)}</h2>}
      <div className="home-session-meta">
        {etat.etat === "calibration" ? <span className="home-phase">Premiers repères · Calibration</span> : aFaire && etat.seance ? <span>{etat.seance.nom}</span> : null}
        {aFaire && etat.salle && <span className="home-location"><MapPin size={14} aria-hidden />{etat.salle.nom}</span>}
      </div>
      <Link href={etat.action.href} prefetch={false} className="home-start">
        {f.bouton}<ArrowRight size={21} aria-hidden />
      </Link>
      {f.texte && <DetailsAccueil titre={etat.etat === "calibration" ? "Tes premiers repères" : f.titre(etat)} className="home-session-secondary" apercu={<><span>{etat.etat === "calibration" ? "Comment se passe cette séance ?" : "En savoir plus"}</span><ArrowUpRight size={15} aria-hidden /></>}>
        <p>{f.texte}</p>
      </DetailsAccueil>}
    </section>
  );
}
