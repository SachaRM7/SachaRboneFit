"use client";
import { useEffect, useState } from "react";
import { urlIllustration } from "@/lib/referentiels/catalogue";
import {
  imagesAffichables,
  sequenceAnimation,
} from "@/lib/referentiels/illustrations";

interface Props {
  slug: string;
  nom: string;
  /** Nombre de frames disponibles (3 dans la bibliotheque). */
  nbFrames?: number;
  /** Fait defiler les frames pour animer le mouvement. */
  anime?: boolean;
  /** Position choisie pour observer un arrêt sur image. */
  imageFixe?: number;
  /** Millisecondes par frame. */
  vitesseMs?: number;
  className?: string;
}

/**
 * Affiche une illustration d'exercice.
 *
 * Les SVG sont utilises tels quels, sans retouche du trace. Ils sont monochromes
 * (`fill="#fff"`), donc invisibles sur fond clair s'ils sont poses en <img> :
 * on les applique en masque CSS et c'est `currentColor` qui les peint. Ils
 * suivent ainsi le theme sans qu'aucun fichier soit modifie.
 */
export function IllustrationExercice({
  slug,
  nom,
  nbFrames = 3,
  anime = false,
  imageFixe,
  vitesseMs = 700,
  className = "",
}: Props) {
  /*
   * Les images retenues, et elles seules.
   *
   * `cable-crunch` en fait alterner une qui vient d'un autre rendu du même
   * mouvement : l'animation montrait deux dessins différents pour un seul
   * exercice. Le manifeste dit lesquelles écarter, et pourquoi.
   */
  const images = imagesAffichables(slug, nbFrames);
  const [frame, setFrame] = useState(images[0] ?? 1);

  useEffect(() => {
    if (!anime || images.length < 2) return;

    // Respecte la preference systeme de mouvement reduit.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const sequence = sequenceAnimation(images);
    let index = 0;
    const id = setInterval(() => {
      index = (index + 1) % sequence.length;
      setFrame(sequence[index]!);
    }, vitesseMs);

    return () => clearInterval(id);
    // `images` se recalcule à chaque rendu : on dépend de sa forme, pas de son
    // identité, sinon l'intervalle repartirait de zéro sans arrêt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime, images.join(","), vitesseMs]);

  // Rien d'honnête à montrer : on n'affiche rien plutôt qu'un geste faux.
  if (images.length === 0) return null;

  return (
    <span
      role="img"
      aria-label={`Illustration : ${nom}`}
      className={`inline-block bg-current ${className}`}
      style={{
        maskImage: `url(${urlIllustration(slug, imageFixe && images.includes(imageFixe) ? imageFixe : frame)})`,
        WebkitMaskImage: `url(${urlIllustration(slug, imageFixe && images.includes(imageFixe) ? imageFixe : frame)})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
