"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  SYMPTOMES_GENERAUX, NOTE_SYMPTOME_MAX, type SymptomeGeneral,
} from "@/lib/referentiels/symptomes";
import { prudenceSymptomes } from "@/lib/engine/symptome-general";
import { arreterEnConsignant } from "./incident-en-vol";
import type { ExerciceRestant } from "@/lib/sos/types";

/**
 * Un symptôme général qui apparaît en pleine séance.
 *
 * CE QUE CET ÉCRAN GARANTIT, ET QUI EST TOUT L'ENJEU
 *
 * 1. LE SIGNALEMENT EST CONSIGNÉ DANS TOUS LES CAS. Y compris — surtout —
 *    quand la personne choisit de continuer. C'est le cas du 6 septembre : un
 *    mal de tête à 2/10 ne change rien à la séance, et doit quand même exister
 *    dans l'historique. Une modale qu'on ferme sans rien laisser derrière est
 *    la façon la plus sûre de perdre l'information qu'on vient de demander.
 *
 * 2. CHAQUE PHRASE A SON GESTE, ET IL AGIT. Si l'écran dit « alléger », le
 *    bouton allège réellement la suite ; s'il dit « terminer », il termine.
 *    C'est la correction qui avait été faite sur `SOSEnergie`, et on ne
 *    réintroduit pas ici le bouton « Appliquer » qui n'appliquait rien.
 *
 * 3. RIEN N'EST DÉCIDÉ À LA PLACE DE L'UTILISATEUR. « Je continue » est
 *    toujours là, y compris à 9/10.
 *
 * LA RÈGLE VIENT DU MOTEUR. `prudenceSymptomes` est la même fonction que
 * l'état du jour appelle le matin : ce composant ne compare aucune intensité à
 * un seuil écrit ici. Un second barème dans React aurait divergé du premier
 * ajustement, et un test structurel le refuse.
 */

interface Props {
  exercicesRestants: ExerciceRestant[];
  onClose: () => void;
  /** Allège la suite : coupe les accessoires restants. */
  onAlleger: (exercicesCoupes: string[]) => void;
  onStopSeance: () => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
}

export function SOSSymptome({
  exercicesRestants, onClose, onAlleger, onStopSeance, onIncident,
}: Props) {
  const [symptome, setSymptome] = useState<SymptomeGeneral | null>(null);
  const [intensite, setIntensite] = useState(3);
  const [note, setNote] = useState("");
  const [confirme, setConfirme] = useState(false);

  const declare = symptome
    ? { symptome, intensite, moment: "pendant_seance" as const }
    : null;
  // Déterministe et sans effet : la conduite se recalcule à chaque déplacement
  // du curseur, et on voit ce qui serait proposé avant de décider quoi que ce soit.
  const prudence = prudenceSymptomes(declare ? [declare] : []);

  /*
   * Les accessoires restants — ce que « alléger » retire.
   *
   * Même définition que la baisse d'énergie : on garde les piliers, on coupe
   * les accessoires. Inventer ici un second critère de coupe aurait produit
   * deux façons d'alléger une séance selon le bouton emprunté.
   */
  const accessoires = exercicesRestants.filter((e) => e.categorie_role === "accessoire");

  const tracer = (decision: string) => {
    if (!declare) return;
    const texte = note.trim();
    onIncident({
      type: "symptome_general",
      contexte: {
        symptome: declare.symptome,
        intensite: declare.intensite,
        // Absente plutôt que vide : une note blanche voyagerait jusqu'au
        // contexte du modèle sans rien y ajouter.
        ...(texte ? { note: texte } : {}),
        moment: "pendant_seance",
      },
      decision,
    });
  };

  const continuer = () => {
    // Consigné quand même : c'est la ligne qui rend le 6 septembre relisible.
    tracer("continuer");
    onClose();
  };

  const alleger = () => {
    tracer("alleger");
    onAlleger(accessoires.map((e) => e.nom));
    onClose();
  };

  /*
   * L'arrêt passe par le module, pas par trois lignes recopiées ici.
   *
   * L'ordre — consigner, puis quitter — et le fait que la persistance ne
   * puisse ni retarder ni empêcher l'arrêt sont des INVARIANTS, pas un style
   * d'écriture. Ils se prouvent dans `incident-en-vol.test.ts`, avec une
   * requête qui ne se résout jamais ; ils ne se prouveraient pas sur un
   * composant React sans rendu, clic et horloge.
   */
  const arreter = () => arreterEnConsignant({
    consigner: () => tracer("arreter"),
    onStopSeance,
    onClose,
  });

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Qu&apos;est-ce que tu ressens ?</h2>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        {/* Six pastilles plutôt qu'une liste déroulante : un appui, sans
            ouvrir un second niveau au milieu d'une séance. */}
        <div className="grid grid-cols-2 gap-2">
          {SYMPTOMES_GENERAUX.map((s) => (
            <button
              key={s.valeur}
              onClick={() => setSymptome(s.valeur)}
              aria-pressed={symptome === s.valeur}
              className={`rounded-lg px-3 py-2.5 text-sm text-left border transition-colors ${
                symptome === s.valeur
                  ? "border-encre bg-papier-2 text-encre font-medium"
                  : "border-filet bg-papier-2 text-encre-2"
              }`}
            >
              {s.libelle}
            </button>
          ))}
        </div>

        {symptome && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-encre-2 text-sm">Intensité</label>
                <span className="text-encre font-medium chiffres tabular-nums">{intensite}/10</span>
              </div>
              <Slider
                value={[intensite]}
                onValueChange={(v) => setIntensite(Array.isArray(v) ? v[0]! : v)}
                min={1} max={10} step={1}
              />
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_SYMPTOME_MAX))}
              maxLength={NOTE_SYMPTOME_MAX}
              placeholder="Note (facultative)"
              className="w-full px-3 py-2 text-sm rounded-md bg-papier-2 border border-filet text-encre placeholder:text-encre-3"
            />

            <div className="rounded-lg border border-filet bg-papier-2 p-3">
              <p className="text-encre-2 text-sm">{prudence.motif}</p>
            </div>

            {prudence.conduite === "continuer" && (
              /* Rien à appliquer — mais le signalement, lui, part quand même. */
              <Button variant="outline" className="w-full border-filet text-encre" onClick={continuer}>
                Noter et continuer
              </Button>
            )}

            {prudence.conduite === "alleger" && (
              <>
                {accessoires.length > 0 && (
                  <div>
                    <p className="text-encre-2 text-sm">Retirés :</p>
                    <ul className="mt-1 space-y-1">
                      {accessoires.map((e) => (
                        <li key={e.exercise_instance_id}
                          className="text-encre text-sm bg-papier-2 rounded-lg px-3 py-2">{e.nom}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-filet text-encre" onClick={continuer}>
                    Je continue tel quel
                  </Button>
                  <Button className="flex-1 bg-encre text-papier"
                    onClick={alleger} disabled={accessoires.length === 0}>
                    Alléger la suite
                  </Button>
                </div>
                {accessoires.length === 0 && (
                  // Le bouton ne peut rien retirer : le dire, plutôt que de le
                  // laisser cliquable et sans effet.
                  <p className="text-encre-3 text-xs">
                    Il ne reste aucun accessoire à retirer.
                  </p>
                )}
              </>
            )}

            {prudence.conduite === "arreter" && (
              <>
                {confirme ? (
                  <div className="space-y-2">
                    <p className="text-encre-2 text-sm">
                      La séance sera clôturée avec les séries déjà validées. Celles-ci sont
                      conservées.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 border-filet text-encre"
                        onClick={() => setConfirme(false)}>
                        Finalement je continue
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={arreter}>
                        Terminer maintenant
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 border-filet text-encre" onClick={continuer}>
                      Je continue
                    </Button>
                    <Button className="flex-1 bg-encre text-papier" onClick={() => setConfirme(true)}>
                      Terminer la séance
                    </Button>
                  </div>
                )}
              </>
            )}

            <p className="text-encre-3 text-xs">
              Consigné pour adapter la séance. Ce n&apos;est pas un avis médical.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
