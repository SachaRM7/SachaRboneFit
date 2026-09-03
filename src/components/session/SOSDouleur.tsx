"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZONES_DOULEUR } from "@/lib/referentiels/muscles";
import {
  evaluerDouleur,
  type ExerciceAvecMuscles,
  type PropositionExercice,
  type TypeDouleur,
} from "@/lib/sos/douleur";

const ZONES = ZONES_DOULEUR.map((z) => z.zone);

const TYPES: Array<{ valeur: TypeDouleur; libelle: string }> = [
  { valeur: "sourde", libelle: "Sourde" },
  { valeur: "raideur", libelle: "Raideur" },
  { valeur: "aiguë", libelle: "Aiguë" },
  { valeur: "irradiation", libelle: "Qui irradie" },
];

interface SOSDouleurProps {
  exercicesRestants: ExerciceAvecMuscles[];
  onClose: () => void;
  onStopSeance: () => void;
  onSkipExercices: (ids: string[]) => void;
  onAllegerExercices: (ids: string[]) => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
  sessionLogId: string;
}

/**
 * Déclarer une gêne pendant la séance.
 *
 * L'écran appliquait les retraits AVANT de les montrer : `handleEvaluate`
 * appelait `onSkipExercices` dans la foulée du calcul, puis affichait un
 * « Résultat » qui ne faisait que constater ce qui était déjà fait. Et le
 * calcul lui-même balayait tout ce qui touchait la zone — une gêne au poignet
 * retirait tous les tirages.
 *
 * L'ordre est maintenant celui qu'on attend d'un coach : on décrit, il
 * explique exercice par exercice, puis on choisit. Rien n'est appliqué avant
 * ce choix.
 *
 * Une seule zone était sélectionnable ; on peut en désigner plusieurs, parce
 * qu'une gêne ne se range pas toujours dans une case.
 */
export function SOSDouleur({
  exercicesRestants,
  onClose,
  onStopSeance,
  onSkipExercices,
  onAllegerExercices,
  onIncident,
}: SOSDouleurProps) {
  const [zones, setZones] = useState<string[]>([]);
  const [niveau, setNiveau] = useState(5);
  const [type, setType] = useState<TypeDouleur>("sourde");
  const [vueResultat, setVueResultat] = useState(false);

  const bilan = evaluerDouleur(zones, niveau, type, exercicesRestants);
  const idsPour = (p: PropositionExercice) =>
    bilan.exercices.filter((e) => e.proposition === p).map((e) => e.exercise_instance_id);

  const tracer = (decision: string) =>
    onIncident({
      type: "douleur",
      contexte: {
        zones, niveau, type_douleur: type,
        arret_conseille: bilan.arretConseille,
        a_retirer: idsPour("retirer").length,
        a_alleger: idsPour("alleger").length,
      },
      decision,
    });

  const appliquer = () => {
    const retirer = idsPour("retirer");
    const alleger = idsPour("alleger");
    if (retirer.length > 0) onSkipExercices(retirer);
    if (alleger.length > 0) onAllegerExercices(alleger);
    tracer(bilan.message);
    onClose();
  };

  const arreter = () => {
    tracer("Séance arrêtée sur douleur");
    onStopSeance();
    onClose();
  };

  const cadre = (contenu: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">
            {vueResultat ? "Ce que je te propose" : "Où as-tu mal ?"}
          </h2>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>
        {contenu}
      </div>
    </div>
  );

  if (vueResultat) {
    const concernes = bilan.exercices.filter((e) => e.implication !== "non_concerne");
    return cadre(
      <>
        <div className="rounded-lg border border-filet bg-papier-2 p-3">
          <p className="text-encre-2 text-sm">{bilan.message}</p>
        </div>

        {concernes.length > 0 && (
          <ul className="space-y-2">
            {concernes.map((e) => (
              <li key={e.exercise_instance_id} className="bg-papier-2 rounded-lg px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-encre text-sm font-medium">{e.nom}</span>
                  <span className="text-encre-3 text-xs shrink-0">
                    {e.proposition === "retirer" ? "à retirer"
                      : e.proposition === "alleger" ? "à alléger" : "à surveiller"}
                  </span>
                </div>
                {/* La raison, exercice par exercice : c'est elle qui permet de
                    ne pas être d'accord en connaissance de cause. */}
                <p className="text-encre-3 text-xs mt-0.5">{e.pourquoi}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-filet text-encre"
            onClick={() => setVueResultat(false)}>
            Modifier
          </Button>
          {bilan.arretConseille ? (
            <Button variant="destructive" className="flex-1" onClick={arreter}>
              Arrêter la séance
            </Button>
          ) : idsPour("retirer").length + idsPour("alleger").length > 0 ? (
            <Button className="flex-1 bg-encre text-papier" onClick={appliquer}>
              Adapter la suite
            </Button>
          ) : (
            /* Aucun changement à appliquer : pas de bouton qui prétende le faire. */
            <Button variant="outline" className="flex-1 border-filet text-encre" onClick={onClose}>
              Continuer
            </Button>
          )}
        </div>

        {bilan.arretConseille && (
          <button type="button" onClick={onClose}
            className="w-full text-xs text-encre-3 underline underline-offset-4">
            Je préfère continuer malgré tout
          </button>
        )}
      </>,
    );
  }

  return cadre(
    <>
      <div className="space-y-2">
        <p className="text-encre-2 text-sm">Zone — tu peux en choisir plusieurs</p>
        <div className="flex flex-wrap gap-1.5">
          {ZONES.map((z) => {
            const choisie = zones.includes(z);
            return (
              <button
                key={z}
                type="button"
                aria-pressed={choisie}
                onClick={() => setZones((l) => (choisie ? l.filter((x) => x !== z) : [...l, z]))}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  choisie
                    ? "bg-encre text-papier border-encre"
                    : "bg-papier-2 text-encre-2 border-filet"
                }`}
              >
                {z}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-encre-2 text-sm">Intensité</label>
          <span className="text-encre font-medium chiffres tabular-nums">{niveau}/10</span>
        </div>
        <Slider value={[niveau]} onValueChange={(v) => setNiveau(Array.isArray(v) ? v[0]! : v)}
          min={1} max={10} step={1} className="w-full" />
      </div>

      <div className="space-y-2">
        <p className="text-encre-2 text-sm">Type</p>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.valeur}
              type="button"
              aria-pressed={type === t.valeur}
              onClick={() => setType(t.valeur)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                type === t.valeur
                  ? "bg-encre text-papier border-encre"
                  : "bg-papier-2 text-encre-2 border-filet"
              }`}
            >
              {t.libelle}
            </button>
          ))}
        </div>
      </div>

      <Button className="w-full bg-encre text-papier" disabled={zones.length === 0}
        onClick={() => setVueResultat(true)}>
        Voir ce que ça change
      </Button>
    </>,
  );
}
