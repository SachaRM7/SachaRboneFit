"use client";
import { useEffect, useState } from "react";
import { urlIllustration } from "@/lib/referentiels/catalogue";

interface Props {
  slug: string;
  nom: string;
  /** Nombre de frames disponibles (3 dans la bibliotheque). */
  nbFrames?: number;
  /** Fait defiler les frames pour animer le mouvement. */
  anime?: boolean;
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
  vitesseMs = 700,
  className = "",
}: Props) {
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    if (!anime || nbFrames < 2) return;

    // Respecte la preference systeme de mouvement reduit.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    // Aller-retour 1 -> n -> 1 : la sequence decrit un mouvement, pas une boucle.
    const sequence = [
      ...Array.from({ length: nbFrames }, (_, i) => i + 1),
      ...Array.from({ length: nbFrames - 2 }, (_, i) => nbFrames - 1 - i),
    ];
    let index = 0;
    const id = setInterval(() => {
      index = (index + 1) % sequence.length;
      setFrame(sequence[index]!);
    }, vitesseMs);

    return () => clearInterval(id);
  }, [anime, nbFrames, vitesseMs]);

  return (
    <span
      role="img"
      aria-label={`Illustration : ${nom}`}
      className={`inline-block bg-current ${className}`}
      style={{
        maskImage: `url(${urlIllustration(slug, frame)})`,
        WebkitMaskImage: `url(${urlIllustration(slug, frame)})`,
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
