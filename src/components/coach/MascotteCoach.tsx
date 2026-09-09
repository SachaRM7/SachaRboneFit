"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  ASSETS_MASCOTTE,
  LARGEURS_MASCOTTE,
  urlMascotte,
  type EtatVisuelMascotte,
  type TailleMascotte,
} from "@/lib/coach/mascotte-assets";

/**
 * LE COACH, EN IMAGE — et rien d'autre.
 *
 * CE COMPOSANT NE DÉCIDE RIEN
 *
 * Il reçoit un état et l'affiche. Il ne lit pas le store, n'interroge pas le
 * moteur, ne sait pas ce qu'est une série. C'est délibéré : le jour où une
 * condition métier se glisse ici, elle devient invisible aux tests du moteur et
 * se met à diverger de la vérité qu'elle prétend illustrer. Le choix de l'état
 * appartient aux résolveurs (`lib/coach/resoudre-mascotte.ts`), la vérité
 * appartient au moteur et à la base.
 *
 * LA MASCOTTE N'EST JAMAIS LA SEULE PORTEUSE D'UNE INFORMATION
 *
 * Elle accompagne un texte qui dit déjà le fait. Un utilisateur qui ne voit pas
 * les images — lecteur d'écran, images bloquées, fichier manquant — ne perd donc
 * aucune information : c'est pourquoi la plupart des états sont décoratifs
 * (`alt=""`), et pourquoi le repli n'est pas une erreur mais une icône.
 */

interface Props {
  etat: EtatVisuelMascotte;
  /** L'échelle du fichier chargé. Voir `LARGEURS_MASCOTTE`. */
  taille?: TailleMascotte;
  /**
   * La place que la mascotte prend à l'écran, indépendamment du fichier.
   *
   *   discrete  40 px   une présence en coin, à côté d'un texte
   *   normale   72 px   une carte, une feuille
   *   forte    120 px   la mascotte est le sujet
   */
  presence?: "discrete" | "normale" | "forte";
  /** Une apparition douce, une seule fois. Coupée si le système la refuse. */
  anime?: boolean;
  className?: string;
  /**
   * Forcer un texte alternatif.
   *
   * À n'employer que si la mascotte porte, à cet endroit précis, une nuance que
   * le texte voisin ne porte pas. Par défaut, le registre décide — et il choisit
   * le plus souvent le silence.
   */
  alt?: string;
}

const TAILLE_PRESENCE = { discrete: 40, normale: 72, forte: 120 } as const;

export function MascotteCoach({
  etat,
  taille = "normal",
  presence = "normale",
  anime = false,
  className = "",
  alt,
}: Props) {
  /*
   * Un fichier manquant ne casse jamais un écran.
   *
   * Le repli garde EXACTEMENT la même boîte : sans cela, la disparition d'un
   * asset ferait sauter la mise en page autour de lui, ce qui est pire que
   * l'image absente. Voir le test `mascotte-assets`.
   */
  const [echec, setEchec] = useState(false);

  const cote = TAILLE_PRESENCE[presence];
  const texte = alt ?? ASSETS_MASCOTTE[etat].alt;
  const decorative = texte === "";

  const boite = {
    width: cote,
    height: cote,
    // La hauteur est réservée avant le chargement : pas de saut de mise en page.
    flexShrink: 0,
  } as const;

  if (echec) {
    return (
      <span
        className={`mascotte mascotte-repli ${className}`}
        style={boite}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : texte}
        aria-hidden={decorative || undefined}
        data-etat={etat}
      >
        <Sparkles style={{ width: cote * 0.45, height: cote * 0.45 }} aria-hidden />
      </span>
    );
  }

  return (
    /*
     * `<img>` et non `next/image` : le projet n'utilise pas l'optimiseur, et ces
     * fichiers sont DÉJÀ optimisés hors ligne — 17 Ko en WebP, dimensions
     * connues. Le faire repasser par un pipeline d'optimisation à la demande
     * ajouterait une latence pour ne rien gagner.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urlMascotte(etat, taille)}
      alt={texte}
      width={LARGEURS_MASCOTTE[taille]}
      height={LARGEURS_MASCOTTE[taille]}
      // Chargée à la demande : le Live ne doit pas payer treize images au
      // démarrage pour n'en montrer qu'une.
      loading="lazy"
      decoding="async"
      onError={() => setEchec(true)}
      className={`mascotte ${anime ? "mascotte-entre" : ""} ${className}`}
      style={{ ...boite, objectFit: "contain" }}
      aria-hidden={decorative || undefined}
      data-etat={etat}
    />
  );
}
