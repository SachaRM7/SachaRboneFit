"use client";

import { useEffect, useState } from "react";
import { jourEnToutesLettres } from "@/lib/format-date";

interface SessionDebriefProps {
  sessionLogId: string;
}

interface Debrief {
  contenu: string;
  genereLe: string;
  modele: string | null;
  perime: boolean;
}

/**
 * Le débrief de la séance : lu, jamais regénéré par une lecture.
 *
 * La version précédente demandait au coach d'écrire un débrief à CHAQUE
 * ouverture de la fiche — y compris pour une séance vieille de six mois qu'on
 * ouvrait pour vérifier une charge. Et elle n'affichait rien : elle lisait la
 * réponse comme un flux d'événements (`data: …`) alors que la route du coach
 * répond en JSON. Le texte restait vide, le chargement se terminait, et il
 * restait un cadre titré sans contenu — un appel modèle payé pour rien, à
 * chaque consultation.
 *
 * Le débrief est maintenant produit à la clôture de la séance et conservé. Cet
 * écran le LIT. Générer et régénérer sont des boutons, c'est-à-dire des
 * décisions.
 */
export function SessionDebrief({ sessionLogId }: SessionDebriefProps) {
  const [etat, setEtat] = useState<{
    cle: string;
    debrief: Debrief | null;
    echec: boolean;
  } | null>(null);
  const [generation, setGeneration] = useState(false);
  const [erreurGeneration, setErreurGeneration] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/sessions/${sessionLogId}/debrief`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!annule) setEtat({ cle: sessionLogId, debrief: d?.debrief ?? null, echec: false });
      })
      .catch(() => {
        if (!annule) setEtat({ cle: sessionLogId, debrief: null, echec: true });
      });
    return () => { annule = true; };
  }, [sessionLogId]);

  const generer = async () => {
    setGeneration(true);
    setErreurGeneration(null);
    try {
      const res = await fetch(`/api/sessions/${sessionLogId}/debrief`, { method: "POST" });
      const corps = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corps?.error ?? "Génération impossible");
      setEtat({ cle: sessionLogId, debrief: corps.debrief, echec: false });
    } catch (e) {
      setErreurGeneration(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setGeneration(false);
    }
  };

  const chargement = etat?.cle !== sessionLogId;
  const debrief = etat?.debrief ?? null;

  return (
    <div className="bg-carte border border-filet rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-medium text-encre-2">Débrief du coach</h3>

      {chargement ? (
        <div className="flex gap-1 py-2" role="status" aria-label="Lecture du débrief">
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      ) : debrief ? (
        <>
          <p className="text-sm text-encre-2 whitespace-pre-wrap">{debrief.contenu}</p>
          {/* Ce que le texte est : daté, et écrit par quelque chose. Sans ça,
              un débrief d'il y a six mois se lit comme une lecture du jour. */}
          <p className="text-encre-3 text-xs">
            Écrit le {jourEnToutesLettres(debrief.genereLe.slice(0, 10))}
            {debrief.modele ? ` · ${debrief.modele}` : ""}
          </p>
          {debrief.perime && (
            <p className="text-encre-3 text-xs">
              Les séries de cette séance ont changé depuis. Ce texte décrit ce qui était
              enregistré au moment où il a été écrit.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-encre-2">
          {etat?.echec
            ? "Impossible de lire le débrief de cette séance."
            : "Aucun débrief n'a été écrit pour cette séance."}
        </p>
      )}

      {erreurGeneration && <p className="text-sm text-perte">{erreurGeneration}</p>}

      {/* Générer coûte un appel au modèle : c'est un bouton, et il dit
          laquelle des deux choses il fait. */}
      {!chargement && (
        <button
          type="button"
          onClick={() => void generer()}
          disabled={generation}
          className="h-9 px-3 rounded-lg border border-filet text-encre text-sm disabled:opacity-40"
        >
          {generation
            ? "Le coach écrit…"
            : debrief
              ? "Régénérer"
              : "Demander un débrief"}
        </button>
      )}
    </div>
  );
}
