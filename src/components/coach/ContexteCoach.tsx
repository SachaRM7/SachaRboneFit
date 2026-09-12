"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import type { ContexteEcran, Ecran, Sujet, TypeEntite } from "@/lib/coach/contexte-ecran";

/**
 * Ce que le coach sait de l'endroit d'où on l'ouvre.
 *
 * Chaque écran déclare son contexte en se montant ; le tiroir le lit au moment
 * de l'ouverture. Le contexte est REMPLACÉ à chaque déclaration, jamais
 * fusionné : garder celui de l'écran précédent après navigation ferait
 * répondre le coach sur ce qu'on ne regarde plus.
 *
 * La route `/coach` est la destination libre ; le tiroir contextuel évite de
 * quitter l'écran. C'est ce qui garantit qu'en le fermant pendant une séance on
 * retombe exactement sur le même exercice et la même série — il n'y a pas eu de
 * navigation à défaire.
 */

interface Etat {
  contexte: ContexteEcran | null;
  ouvert: boolean;
  declarer: (c: ContexteEcran | null) => void;
  /**
   * Ouvrir le tiroir, éventuellement en désignant un sujet précis.
   *
   * `precisions` sert au constat de séance : il désigne l'exercice concerné et
   * le TYPE de constat. Rien d'autre ne transite — le serveur relit la séance
   * depuis la session authentifiée.
   */
  ouvrir: (
    sujet?: Sujet,
    precisions?: Pick<ContexteEcran, "typeEntite" | "entiteId" | "signal" | "sessionLogId" | "numeroSerie">,
  ) => void;
  fermer: () => void;
  agir: (action: "douleur" | "machine") => void;
  relierActions: (action: ((type: "douleur" | "machine") => void) | null) => void;
}

const CoachContexte = createContext<Etat | null>(null);

export function FournisseurCoach({ children }: { children: React.ReactNode }) {
  const [contexte, setContexte] = useState<ContexteEcran | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const actionsLive = useRef<((type: "douleur" | "machine") => void) | null>(null);
  const relierActions = useCallback((action: typeof actionsLive.current) => { actionsLive.current = action; }, []);
  const agir = useCallback((action: "douleur" | "machine") => {
    if (actionsLive.current) { setOuvert(false); actionsLive.current(action); }
  }, []);

  const declarer = useCallback((c: ContexteEcran | null) => setContexte(c), []);

  const ouvrir = useCallback<Etat["ouvrir"]>(
    (sujet, precisions) => {
      if (sujet || precisions) {
        setContexte((c) => ({
          ...(c ?? { ecran: "plus" }),
          ...(sujet ? { sujet } : {}),
          ...(precisions ?? {}),
        }));
      }
      setOuvert(true);
    },
    [],
  );

  const fermer = useCallback(() => {
    setOuvert(false);
    // L'intention ne survit pas à la fermeture : elle valait pour cette
    // ouverture-là. L'écran, lui, reste celui où l'on se trouve.
    // L'intention ET le constat qui l'accompagnait valaient pour cette
    // ouverture-là : les garder ferait répondre le Coach sur un fait dépassé.
    setContexte((c) => (c?.sujet || c?.signal ? { ...c, sujet: null, signal: null } : c));
  }, []);

  const valeur = useMemo(
    () => ({ contexte, ouvert, declarer, ouvrir, fermer, agir, relierActions }),
    [contexte, ouvert, declarer, ouvrir, fermer, agir, relierActions],
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
  sessionLogId, numeroSerie,
}: {
  ecran: Ecran;
  typeEntite?: TypeEntite | null;
  entiteId?: string | null;
  sessionLogId?: string; numeroSerie?: number;
}) {
  const { declarer } = useCoach();

  useEffect(() => {
    declarer({ ecran, typeEntite, entiteId, sujet: null, sessionLogId, numeroSerie });
    return () => declarer(null);
  }, [declarer, ecran, typeEntite, entiteId, sessionLogId, numeroSerie]);

  return null;
}

export function ActionsCoachLive({ onAction }: { onAction: (action: "douleur" | "machine") => void }) {
  const { relierActions } = useCoach();
  useEffect(() => { relierActions(onAction); return () => relierActions(null); }, [relierActions, onAction]);
  return null;
}

export function useCoachFacultatif() { return useContext(CoachContexte); }
