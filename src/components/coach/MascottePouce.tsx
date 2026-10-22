"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { animerPouce, CONTOURS_POUCE } from "@/lib/coach/mascotte-pouce";

interface Props {
  source: string;
  texte: string;
  className: string;
  style: CSSProperties;
  onError: () => void;
}

/** Texture inchangée, articulations indépendantes ; le corps reste immobile. */
export function MascottePouce({ source, texte, className, style, onError }: Props) {
  const reference = useRef<SVGSVGElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const nom = (suffixe: string) => `${id}-${suffixe}`;
  const url = (suffixe: string) => `url(#${nom(suffixe)})`;
  const dessin = `#${nom("dessin")}`;
  useEffect(() => {
    if (!reference.current) return;
    const animation = animerPouce(reference.current, source, onError);
    return () => animation.detruire();
  }, [source, onError]);

  return (
    <svg ref={reference} viewBox="0 0 1250 1250" className={`mascotte ${className}`} style={style}
      role={texte ? "img" : undefined} aria-label={texte || undefined} aria-hidden={!texte || undefined}
      data-etat="encouragement" data-mouvement="encouragement" data-geste="pouce">
      <defs>
        <image id={nom("dessin")} width="1250" height="1250" href={source} preserveAspectRatio="xMidYMid meet" />
        {Object.entries(CONTOURS_POUCE).map(([partie, d]) => (
          <clipPath key={partie} id={nom(partie)}><path d={d} /></clipPath>
        ))}
        <mask id={nom("corps")} maskUnits="userSpaceOnUse" x="0" y="0" width="1250" height="1250">
          <rect width="1250" height="1250" fill="white" />
          {Object.entries(CONTOURS_POUCE).map(([partie, d]) => <path key={partie} d={d} fill="black" />)}
        </mask>
        <mask id={nom("sans-pouce")} maskUnits="userSpaceOnUse" x="0" y="0" width="1250" height="1250">
          <rect width="1250" height="1250" fill="white" /><path d={CONTOURS_POUCE.pouce} fill="black" />
        </mask>
        <radialGradient id={nom("joint")} cx="32%" cy="25%">
          <stop offset="0" stopColor="#56595c" /><stop offset=".65" stopColor="#303235" /><stop offset="1" stopColor="#151719" />
        </radialGradient>
      </defs>
      <g data-partie="rig" style={{ display: "none" }}>
        <use href={dessin} mask={url("corps")} />
        <ellipse data-partie="joint" cx="416" cy="612" rx="49" ry="83" fill={url("joint")} />
        <g data-partie="coude">
          <ellipse cx="322" cy="472" rx="34" ry="24" fill={url("joint")} />
          <g data-partie="pouce"><use href={dessin} clipPath={url("pouce")} /></g>
          <use href={dessin} clipPath={url("bras")} mask={url("sans-pouce")} />
        </g>
        <g data-partie="eclats"><use href={dessin} clipPath={url("eclats")} /></g>
      </g>
      <use data-partie="fixe" href={dessin} />
    </svg>
  );
}
