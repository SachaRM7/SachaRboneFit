"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Mannequin } from "@/components/anatomie/Mannequin";
import { musclesDesRegions, zonesDesRegions } from "@/lib/referentiels/anatomie";
import { LIBELLES } from "@/lib/referentiels/muscles";
import { MOMENTS_DOULEUR, type MomentDouleur } from "@/lib/engine/incident-douleur";
import {
  evaluerDouleur,
  type ExerciceAvecMuscles,
  type PropositionExercice,
  type TypeDouleur,
} from "@/lib/sos/douleur";

/** Ce que le serveur propose de ménager, après avoir consigné l'incident. */
interface PropositionProtection {
  zone: string;
  libelleMuscles: string;
  severite: number;
  motif: string;
  effets: string[];
}

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
  sessionLogId: string;
}

/**
 * Déclarer une gêne pendant la séance.
 *
 * L'écran appliquait autrefois les retraits AVANT de les montrer, et balayait
 * tout ce qui touchait la zone. L'ordre est depuis celui qu'on attend d'un
 * coach : on décrit, il explique exercice par exercice, puis on choisit.
 *
 * CE QUI CHANGE ICI, ET POURQUOI
 *
 * 1. On MONTRE où ça fait mal. Dix-sept pastilles alignées — « Épaule / Coude /
 *    Poignet » — demandent de traduire une sensation en vocabulaire avant de
 *    pouvoir la signaler, debout, entre deux séries. Le mannequin se touche.
 *    Il apporte en prime la face et le côté, que la liste ne pouvait pas dire.
 *
 * 2. La chaîne ne s'arrête plus à l'incident. Une gêne forte ou qui revient
 *    donne lieu à une PROPOSITION — jamais à une contrainte automatique. Le
 *    troisième écran ci-dessous est le seul endroit d'où une contrainte peut
 *    naître, et il faut y appuyer sur « Oui ».
 *
 * TROIS ÉCRANS, ET UN SEUL À LA FOIS
 *
 *   saisie      où, combien, quelle nature, et — facultatif — à quel moment.
 *   résultat    ce que ça change pour la suite de la séance. Rien n'est
 *               appliqué avant que ce bouton-là soit touché.
 *   protection  n'apparaît QUE si la règle l'a dit, et après que l'incident a
 *               été consigné. « Arrêter la séance » n'est jamais enfoui
 *               derrière : quand l'arrêt est conseillé, il est pris d'abord et
 *               la proposition s'affiche par-dessus, avant la navigation.
 */
export function SOSDouleur({
  exercicesRestants,
  onClose,
  onStopSeance,
  onSkipExercices,
  onAllegerExercices,
  sessionLogId,
}: SOSDouleurProps) {
  const [regions, setRegions] = useState<string[]>([]);
  const [niveau, setNiveau] = useState(5);
  const [type, setType] = useState<TypeDouleur>("sourde");
  const [moment, setMoment] = useState<MomentDouleur | null>(null);
  const [etape, setEtape] = useState<"saisie" | "resultat" | "protection">("saisie");
  const [propositions, setPropositions] = useState<PropositionProtection[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Ce qu'il reste à faire une fois la proposition tranchée. */
  const [apres, setApres] = useState<"fermer" | "arreter">("fermer");

  // Les zones du référentiel viennent des régions touchées : c'est le seul
  // pont, et il est calculé au même endroit côté client et côté serveur.
  const zones = zonesDesRegions(regions);
  const bilan = evaluerDouleur(zones, niveau, type, exercicesRestants);
  const idsPour = (p: PropositionExercice) =>
    bilan.exercices.filter((e) => e.proposition === p).map((e) => e.exercise_instance_id);

  /**
   * Consigne l'incident et récupère ce que la règle en dit.
   *
   * Le serveur retraduit lui-même les régions en zones : ce que le client
   * envoie sert à désigner, pas à décider. Un échec ne bloque pas l'adaptation
   * de la séance — elle est locale — mais il se dit, parce qu'un signalement
   * perdu est précisément ce qui empêchera la prochaine récurrence d'être vue.
   */
  const signaler = async (decision: string): Promise<PropositionProtection[]> => {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/douleur", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_log_id: sessionLogId,
          regions,
          niveau,
          type_douleur: type,
          moment,
          arret_conseille: bilan.arretConseille,
          a_retirer: idsPour("retirer"),
          a_alleger: idsPour("alleger"),
          decision,
        }),
      });
      if (!res.ok) throw new Error();
      const corps = await res.json();
      return corps.propositions ?? [];
    } catch {
      setErreur("Signalement non enregistré. L'adaptation de la séance reste appliquée.");
      return [];
    } finally {
      setEnCours(false);
    }
  };

  /** Termine le geste : soit on ferme, soit on quitte la séance. */
  const conclure = (suite: "fermer" | "arreter") => {
    if (suite === "arreter") onStopSeance();
    onClose();
  };

  const poursuivre = async (suite: "fermer" | "arreter", decision: string) => {
    const propos = await signaler(decision);
    if (propos.length > 0) {
      setPropositions(propos);
      setApres(suite);
      setEtape("protection");
      return;
    }
    conclure(suite);
  };

  const appliquer = async () => {
    const retirer = idsPour("retirer");
    const alleger = idsPour("alleger");
    if (retirer.length > 0) onSkipExercices(retirer);
    if (alleger.length > 0) onAllegerExercices(alleger);
    await poursuivre("fermer", bilan.message);
  };

  const arreter = () => poursuivre("arreter", "Séance arrêtée sur douleur");

  /** Le « Oui » — le seul chemin de l'application vers une contrainte. */
  const proteger = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/douleur/proteger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zones: propositions.map((p) => ({ zone: p.zone, severite: p.severite })),
        }),
      });
      if (!res.ok) throw new Error();
      conclure(apres);
    } catch {
      setErreur("Impossible d'enregistrer. Tu pourras le redire depuis « Ce que tu ménages ».");
      setEnCours(false);
    }
  };

  const cadre = (titre: string, contenu: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">{titre}</h2>
          <button onClick={onClose} className="p-2 -mr-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>
        {erreur && <p role="alert" className="text-perte text-sm">{erreur}</p>}
        {contenu}
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Écran 3 — la proposition. Rien n'a encore été écrit dans les contraintes.
  // -------------------------------------------------------------------------
  if (etape === "protection") {
    return cadre("Ménager cette zone ?", (
      <>
        {propositions.map((p) => (
          <div key={p.zone} className="rounded-lg border border-filet bg-papier-2 p-3 space-y-2">
            <p className="text-encre text-sm">
              {`Cette gêne à ${p.zone.toLowerCase()} mérite qu'on en tienne compte. `}
              {`Tu veux que RboneFit la ménage dans les prochaines séances ?`}
            </p>
            <p className="text-encre-3 text-xs">{p.motif}</p>
            {/* Le prix du « Oui », dit avant : une zone peut porter plusieurs
                muscles, et l'athlète doit savoir lesquels seront ménagés. */}
            <p className="text-encre-2 text-xs">
              Zones musculaires concernées : {p.libelleMuscles}.
            </p>
            <ul className="space-y-1">
              {p.effets.map((e) => (
                <li key={e} className="text-encre-3 text-xs flex gap-2">
                  <span aria-hidden>·</span><span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            variant="outline" className="flex-1 border-filet text-encre"
            disabled={enCours}
            onClick={() => conclure(apres)}
          >
            Pas maintenant
          </Button>
          <Button
            className="flex-1 bg-encre text-papier"
            disabled={enCours}
            onClick={() => void proteger()}
          >
            {enCours ? "…" : "Oui, la ménager"}
          </Button>
        </div>
        <p className="text-encre-3 text-xs">
          Tu pourras dire que ça va mieux à tout moment depuis « Ce que tu ménages ».
        </p>
      </>
    ));
  }

  // -------------------------------------------------------------------------
  // Écran 2 — ce que ça change pour la suite de la séance.
  // -------------------------------------------------------------------------
  if (etape === "resultat") {
    const concernes = bilan.exercices.filter((e) => e.implication !== "non_concerne");
    return cadre("Ce que je te propose", (
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
            disabled={enCours} onClick={() => setEtape("saisie")}>
            Modifier
          </Button>
          {bilan.arretConseille ? (
            <Button variant="destructive" className="flex-1" disabled={enCours}
              onClick={() => void arreter()}>
              Arrêter la séance
            </Button>
          ) : idsPour("retirer").length + idsPour("alleger").length > 0 ? (
            <Button className="flex-1 bg-encre text-papier" disabled={enCours}
              onClick={() => void appliquer()}>
              Adapter la suite
            </Button>
          ) : (
            /* Aucun changement à appliquer : pas de bouton qui prétende le
               faire. Le signalement part quand même — c'est lui qui rendra la
               prochaine gêne reconnaissable comme une répétition. */
            <Button variant="outline" className="flex-1 border-filet text-encre"
              disabled={enCours}
              onClick={() => void poursuivre("fermer", bilan.message)}>
              Continuer
            </Button>
          )}
        </div>

        {bilan.arretConseille && (
          <button type="button" disabled={enCours}
            onClick={() => void poursuivre("fermer", "Continue malgré l'arrêt conseillé")}
            className="w-full text-xs text-encre-3 underline underline-offset-4">
            Je préfère continuer malgré tout
          </button>
        )}
      </>
    ));
  }

  // -------------------------------------------------------------------------
  // Écran 1 — la saisie.
  // -------------------------------------------------------------------------
  const musclesVises = musclesDesRegions(regions);

  return cadre("Où as-tu mal ?", (
    <>
      <Mannequin
        mode="douleur"
        selection={regions}
        onSelectionChange={setRegions}
      />

      {/* Ce que l'application comprend de la sélection, en clair.
          Une zone anatomique n'est pas un diagnostic : la phrase dit ce qui
          sera ménagé, pas ce qu'on a. */}
      {musclesVises.length > 0 && (
        <p className="text-encre-3 text-xs">
          Ce que ça touche côté entraînement : {musclesVises.map((m) => LIBELLES[m]).join(", ")}.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-encre-2 text-sm">Intensité</label>
          <span className="text-encre font-medium chiffres tabular-nums">{niveau}/10</span>
        </div>
        <Slider aria-label="Intensité de la gêne" value={[niveau]}
          onValueChange={(v) => setNiveau(Array.isArray(v) ? v[0]! : v)}
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
              className={`h-10 px-3 rounded-full text-sm border transition-colors ${
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

      {/* Facultatif, et il doit le rester : c'est un signalement, pas une
          anamnèse. Aucune règle du moteur ne lit ce champ — il est consigné
          pour être relu par un humain. */}
      <div className="space-y-2">
        <p className="text-encre-2 text-sm">
          Quand ça gêne ? <span className="text-encre-3 text-xs">facultatif</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MOMENTS_DOULEUR.map((m) => {
            const choisi = moment === m.valeur;
            return (
              <button
                key={m.valeur}
                type="button"
                aria-pressed={choisi}
                onClick={() => setMoment(choisi ? null : m.valeur)}
                className={`h-10 px-3 rounded-full text-sm border transition-colors ${
                  choisi
                    ? "bg-encre text-papier border-encre"
                    : "bg-papier-2 text-encre-2 border-filet"
                }`}
              >
                {m.libelle}
              </button>
            );
          })}
        </div>
      </div>

      <Button className="w-full bg-encre text-papier" disabled={regions.length === 0}
        onClick={() => setEtape("resultat")}>
        Voir ce que ça change
      </Button>
    </>
  ));
}
