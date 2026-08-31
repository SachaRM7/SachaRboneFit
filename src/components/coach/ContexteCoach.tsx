"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ContexteEcran, Ecran, Sujet, TypeEntite } from "@/lib/coach/contexte-ecran";

/**
 * Ce que le coach sait de l'endroit d'où on l'ouvre.
 *
 * Chaque écran déclare son contexte en se montant ; le tiroir le lit au moment
 * de l'ouverture. Le contexte est REMPLACÉ à chaque déclaration, jamais
 * fusionné : garder celui de l'écran précédent après navigation ferait
 * répondre le coach sur ce qu'on ne regarde plus.
 *
 * Le tiroir plutôt qu'une route `/coach` : ouvrir le coach ne doit pas faire
 * quitter l'écran. C'est ce qui garantit qu'en le fermant pendant une séance on
 * retombe exactement sur le même exercice et la même série — il n'y a pas eu de
 * navigation à défaire.
 */

interface Etat {
  contexte: ContexteEcran | null;
  ouvert: boolean;
  declarer: (c: ContexteEcran | null) => void;
  ouvrir: (sujet?: Sujet) => void;
  fermer: () => void;
}

const CoachContexte = createContext<Etat | null>(null);

export function FournisseurCoach({ children }: { children: React.ReactNode }) {
  const [contexte, setContexte] = useState<ContexteEcran | null>(null);
  const [ouvert, setOuvert] = useState(false);

  const declarer = useCallback((c: ContexteEcran | null) => setContexte(c), []);

  const ouvrir = useCallback(
    (sujet?: Sujet) => {
      if (sujet) setContexte((c) => (c ? { ...c, sujet } : { ecran: "plus", sujet }));
      setOuvert(true);
    },
    [],
  );

  const fermer = useCallback(() => {
    setOuvert(false);
    // L'intention ne survit pas à la fermeture : elle valait pour cette
    // ouverture-là. L'écran, lui, reste celui où l'on se trouve.
    setContexte((c) => (c?.sujet ? { ...c, sujet: null } : c));
  }, []);

  const valeur = useMemo(
    () => ({ contexte, ouvert, declarer, ouvrir, fermer }),
    [contexte, ouvert, declarer, ouvrir, fermer],
  );

  return <CoachContexte.Provider value={valeur}>{children}</CoachContexte.Provider>;
}

export function useCoach(): Etat {
  const c = useContext(CoachContexte);
  if (!c) throw new Error("useCoach doit être utilisé dans FournisseurCoach");
  return c;
}

/**
 * Déclare le contexte de l'écran courant.
 *
 * À monter dans un écran. Le nettoyage au démontage évite qu'un contexte
 * survive à la navigation : sans lui, ouvrir le coach depuis « Plus » après
 * être passé par Programme lui ferait croire qu'on regarde encore le cycle.
 */
export function DeclarerContexte({
  ecran,
  typeEntite = null,
  entiteId = null,
}: {
  ecran: Ecran;
  typeEntite?: TypeEntite | null;
  entiteId?: string | null;
}) {
  const { declarer } = useCoach();

  useEffect(() => {
    declarer({ ecran, typeEntite, entiteId, sujet: null });
    return () => declarer(null);
  }, [declarer, ecran, typeEntite, entiteId]);

  return null;
}
