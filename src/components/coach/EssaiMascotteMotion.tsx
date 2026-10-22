"use client";

import { useEffect, useRef } from "react";
import { MascotteCoach } from "./MascotteCoach";
import { animerMascotte, type MouvementMascotte } from "@/lib/coach/mascotte-motion";

/** Essai opt-in : aucune surface de production n'importe ce composant. */
export function EssaiMascotteMotion({
  mouvement,
  pause = false,
}: {
  mouvement: MouvementMascotte;
  pause?: boolean;
}) {
  const cadre = useRef<HTMLSpanElement>(null);
  const controle = useRef<ReturnType<typeof animerMascotte> | null>(null);

  useEffect(() => {
    const element = cadre.current;
    const image = element?.querySelector("img");
    if (!element || !image) return;
    const animation = animerMascotte(image, element, mouvement);
    controle.current = animation;
    return () => {
      animation.detruire();
      controle.current = null;
    };
  }, [mouvement]);

  useEffect(() => { controle.current?.pause(pause); }, [pause, mouvement]);

  return (
    <span ref={cadre} style={{ display: "inline-flex", width: 120, height: 120, flexShrink: 0 }}>
      <MascotteCoach key={mouvement} etat={mouvement} presence="forte" />
    </span>
  );
}
