"use client";

import { useState } from "react";
import { messageErreur } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Ce que l'athlète regarde avant de dire oui.
 *
 * La carte n'affiche rien que le coach aurait rédigé : chaque ligne vient de la
 * comparaison entre la séance d'avant et celle d'après, faite côté serveur. Le
 * coach explique dans la conversation, la carte montre l'effet. Si les deux
 * divergent, c'est la carte qui a raison, et c'est elle qu'on applique.
 */

export interface LigneApercu {
  mouvement: "retire" | "ajoute" | "modifie" | "inchange";
  nom: string;
  avant: string | null;
  apres: string | null;
}

export interface Proposition {
  id: string;
  operation: string;
  apercu: {
    resume: string;
    lignes: LigneApercu[];
    seriesAvant: number;
    seriesApres: number;
    avertissements: string[];
  };
  expireLe: string;
}

/**
 * Le signe qui ouvre chaque ligne.
 *
 * Une modification ne porte pas de flèche : elle en contient déjà une entre
 * l'avant et l'après, et deux flèches sur la même ligne se lisent comme deux
 * étapes plutôt que comme une.
 */
const SIGNE: Record<LigneApercu["mouvement"], string> = {
  retire: "−", ajoute: "+", modifie: "·", inchange: "",
};

export function CarteProposition({
  proposition,
  onDecide,
}: {
  proposition: Proposition;
  onDecide: (id: string, decision: "appliquer" | "refuser", message: string) => void;
}) {
  const [enCours, setEnCours] = useState<"appliquer" | "refuser" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(decision: "appliquer" | "refuser") {
    setEnCours(decision);
    setErreur(null);
    try {
      const res = await fetch(`/api/coach/propositions/${proposition.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          messageErreur(decision === "appliquer" ? "appliquer ce changement" : "écarter cette proposition", data?.error, res.status),
        );
      }
      onDecide(
        proposition.id,
        decision,
        decision === "appliquer" ? "Changement appliqué à ta séance." : "Proposition écartée.",
      );
    } catch (e) {
      // Un refus d'application est presque toujours une raison lisible — séance
      // modifiée entre-temps, proposition trop ancienne. On la montre telle
      // quelle plutôt que de la remplacer par un échec générique.
      setErreur(e instanceof Error ? e.message : "Changement non appliqué");
      setEnCours(null);
    }
  }

  const lignes = proposition.apercu.lignes.filter((l) => l.mouvement !== "inchange");

  return (
    <div className="rounded-2xl border border-filet bg-carte p-4 space-y-3">
      <p className="text-encre text-sm font-medium">{proposition.apercu.resume}</p>

      <ul className="space-y-1.5">
        {lignes.map((l, i) => (
          <li key={`${l.nom}-${i}`} className="flex gap-2 text-sm">
            <span
              className={`w-3 shrink-0 chiffres ${
                l.mouvement === "ajoute" ? "text-gain" : l.mouvement === "retire" ? "text-perte" : "text-encre-3"
              }`}
              aria-hidden
            >
              {SIGNE[l.mouvement]}
            </span>
            {/* Un séparateur, sinon « Poste 3 » et « 4 × 6-10 » se collent en
                un seul nombre : « Poste 3 4 × 6-10 ». */}
            <span className="flex-1 min-w-0">
              <span className="text-encre">{l.nom}</span>
              <span className="text-encre-3" aria-hidden> · </span>
              <span className="text-encre-3 chiffres">
                {l.mouvement === "modifie" ? `${l.avant} → ${l.apres}` : (l.apres ?? l.avant)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {proposition.apercu.avertissements.length > 0 && (
        <div className="flex gap-2 rounded-xl bg-papier-2 px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-encre-3" aria-hidden />
          <ul className="text-encre-2 text-xs space-y-1">
            {proposition.apercu.avertissements.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {erreur && <p className="text-perte text-xs">{erreur}</p>}

      <div className="flex gap-2">
        <Button
          onClick={() => void decider("appliquer")}
          disabled={enCours !== null}
          className="flex-1 bg-encre text-papier hover:bg-filet rounded-full h-11"
        >
          {enCours === "appliquer" ? "Un instant…" : "Appliquer"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void decider("refuser")}
          disabled={enCours !== null}
          className="bg-carte border-filet text-encre-2 hover:bg-papier-2 rounded-full h-11 px-5"
        >
          Non merci
        </Button>
      </div>
    </div>
  );
}
