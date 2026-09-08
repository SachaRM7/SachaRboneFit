"use client";
import Link from "next/link";
import {
  ArrowRight,
  Dumbbell,
  MapPin,
  Wrench,
  Ruler,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
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
        ? `Séance ${e.seance.lettre} — calibration`
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

  // La séance prête n'a pas de discours à tenir : son nom et sa salle suffisent.
  const texte =
    etat.etat === "prete"
      ? [etat.seance?.nom, etat.salle?.nom].filter(Boolean).join(" — ")
      : f.texte;

  return (
    <section className="session-hero" aria-labelledby="session-du-jour">
      <div className="session-hero-art" aria-hidden>
        <span className="hero-orbit orbit-one" />
        <span className="hero-orbit orbit-two" />
        <span className="hero-orbit orbit-three" />
        <span className="hero-letter">
          {etat.seance?.lettre || <Icone size={92} strokeWidth={1} />}
        </span>
      </div>
      <div className="hero-copy">
        <p className="hero-category">
          Aujourd’hui ·{" "}
          {etat.etat === "calibration" ? "Calibration" : "Entraînement"}
        </p>
        <h2 id="session-du-jour">{f.titre(etat)}</h2>
        {texte && <p className="hero-description">{texte}</p>}
      </div>
      <div className="hero-footer">
        <Link href={etat.action.href} className="hero-cta">
          {f.bouton}
          <span>
            <ArrowRight size={21} aria-hidden />
          </span>
        </Link>
        {etat.salle && (
          <span className="hero-location">
            <MapPin size={14} aria-hidden />
            {etat.salle.nom}
          </span>
        )}
      </div>
    </section>
  );
}
