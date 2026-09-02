"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { urlIllustration } from "@/lib/referentiels/catalogue";

interface Props {
  slug: string;
  nom: string;
  onFermer: () => void;
}

/**
 * Les trois phases du mouvement, en grand.
 *
 * La bibliothèque fournit trois frames par exercice — début, milieu, fin — et
 * c'est une vraie séquence, pas trois vues d'un même instant. La carte les
 * anime en boucle dans une vignette de 48 px ; ici on les montre à la taille
 * où l'on distingue une position de bras d'une position de dos.
 *
 * Deux modes, parce que les deux questions sont différentes : « à quoi
 * ressemble le geste » se répond en regardant l'animation, « où sont mes
 * coudes en position basse » se répond en arrêtant l'image. Le passage de
 * l'un à l'autre se fait en touchant une phase.
 *
 * Aucune image n'est créée : ce sont les fichiers du dépôt, appliqués en
 * masque CSS comme partout ailleurs, donc peints par le thème courant.
 *
 * FERMETURE — deux gestes, et pas trois. La croix, et Échap.
 *
 * Pas de fermeture au clic sur le fond, parce qu'il n'y a pas de fond : cette
 * surface est opaque et occupe tout l'écran, contrairement à la feuille de
 * détail qui laisse voir la séance derrière elle. Le seul « fond » disponible
 * serait la zone qui entoure l'illustration — c'est-à-dire l'endroit où le
 * pouce se pose pour tenir le téléphone, et où l'on appuie en cherchant à
 * agrandir. Y mettre une fermeture produirait des sorties accidentelles au
 * milieu d'un geste d'observation.
 *
 * La croix mesure 44 px et se trouve dans le coin qu'atteint le pouce.
 */
export function DemonstrationMouvement({ slug, nom, onFermer }: Props) {
  const [phase, setPhase] = useState<number | null>(null);

  // Échap ferme, comme n'importe quelle modale — et le geste au clavier existe
  // aussi sur les tablettes avec housse.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Démonstration : ${nom}`}
      className="fixed inset-0 z-50 bg-papier flex flex-col"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-filet shrink-0">
        <h2 className="font-semibold text-encre truncate pr-3">{nom}</h2>
        {/* 44 px de côté : la cible tactile recommandée, atteignable au pouce
            sans regarder, ce qui est la situation réelle en salle. */}
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer la démonstration"
          className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-encre-2"
        >
          <X className="w-6 h-6" aria-hidden />
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        {phase === null ? (
          <IllustrationExercice
            slug={slug}
            nom={nom}
            anime
            vitesseMs={900}
            className="w-full h-full max-w-sm text-encre"
          />
        ) : (
          <span
            role="img"
            aria-label={`${nom}, phase ${phase} sur 3`}
            className="inline-block bg-current w-full h-full max-w-sm text-encre"
            style={{
              maskImage: `url(${urlIllustration(slug, phase)})`,
              WebkitMaskImage: `url(${urlIllustration(slug, phase)})`,
              maskSize: "contain", WebkitMaskSize: "contain",
              maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
              maskPosition: "center", WebkitMaskPosition: "center",
            }}
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-8 pt-3 border-t border-filet">
        <p className="text-xs text-encre-3 mb-2">
          {phase === null ? "Touche une phase pour l'arrêter" : "Touche « Animer » pour reprendre"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase(null)}
            aria-pressed={phase === null}
            className={`flex-1 h-12 rounded-xl border text-sm font-medium ${
              phase === null
                ? "border-encre bg-encre text-papier"
                : "border-filet bg-carte text-encre-2"
            }`}
          >
            Animer
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPhase(n)}
              aria-pressed={phase === n}
              className={`flex-1 h-12 rounded-xl border text-sm font-medium ${
                phase === n
                  ? "border-encre bg-encre text-papier"
                  : "border-filet bg-carte text-encre-2"
              }`}
            >
              {n === 1 ? "Départ" : n === 2 ? "Milieu" : "Fin"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
