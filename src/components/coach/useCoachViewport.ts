"use client";
import { useEffect, useState, type CSSProperties } from "react";
/** Un seul scroll intérieur, composer dans le viewport réellement visible. */
export function useCoachViewport(actif: boolean): CSSProperties {
  const [dimensions, setDimensions] = useState<CSSProperties>({});
  useEffect(() => {
    if (!actif || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setDimensions({ "--coach-height": `${viewport.height}px`, "--coach-top": `${viewport.offsetTop}px` } as CSSProperties);
    update(); viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); };
  }, [actif]);
  return dimensions;
}
