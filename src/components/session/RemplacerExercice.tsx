"use client";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findSubstitutes, type ExerciseInstanceWithExercise, type SubstituteResult } from "@/lib/engine/substitutions";
import { toast } from "sonner";
import { FicheExecution } from "./FicheExecution";
import type { ContexteExecutionClient } from "./execution-client";

/**
 * Remplacer CET exercice, depuis sa carte.
 *
 * Le remplacement n'était atteignable que par « Machine occupée », dans la
 * barre de dépannage. Or l'occupation n'est qu'une raison parmi d'autres : le
 * 6 septembre, `Cable Crunch` a été abandonné parce qu'il était trop compliqué
 * et gênant à faire en public. Faute de bouton, ses deux séries ont été
 * saisies dans la carte de l'exercice prévu — et la base croit désormais qu'un
 * Cable Crunch se fait à 27 kg.
 *
 * D'où ce bouton, sur la carte, à côté de l'exercice concerné. La raison est
 * demandée d'abord : elle pilote le classement déterministe et permet aussi à
 * la séance de garder trace de ce qui s'est passé. « Trop compliqué » cherche
 * donc une aide plus simple ; « machine prise » conserve la proximité.
 *
 * Deux gestes distincts, et c'est le point important : remplacer aujourd'hui,
 * ou ne plus vouloir de cet exercice. Le second se coche, il ne se déduit pas.
 */

const RAISONS = [
  { cle: "occupee", libelle: "La machine est prise" },
  { cle: "inconfortable", libelle: "Inconfortable" },
  { cle: "trop_complique", libelle: "Trop compliqué" },
  { cle: "genant_en_public", libelle: "Gênant à faire ici" },
  { cle: "douloureux", libelle: "Ça fait mal" },
  { cle: "pas_apprecie", libelle: "Je n'aime pas" },
  { cle: "autre", libelle: "Autre raison" },
] as const;

type Raison = (typeof RAISONS)[number]["cle"];

interface Props {
  sessionLogId: string;
  exerciceId: string;
  exerciceNom: string;
  pilier: string;
  profilTension: string;
  gymId: string;
  parcSalle: ExerciseInstanceWithExercise[];
  /** Les autres exercices de la séance : on ne se remplace pas par soi-même. */
  dejaAuProgramme: string[];
  musclesCourbatures?: string[];
  debutant?: boolean;
  /** Appliqué APRÈS confirmation du serveur, jamais avant. */
  onRemplace: (remplacant: SubstituteResult) => void;
  onReporter?: () => void;
}

export function RemplacerExercice({
  sessionLogId,
  exerciceId,
  exerciceNom,
  pilier,
  profilTension,
  gymId,
  parcSalle,
  dejaAuProgramme,
  musclesCourbatures,
  debutant = false,
  onRemplace,
  onReporter,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [raison, setRaison] = useState<Raison | null>(null);
  const [eviter, setEviter] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [apercu, setApercu] = useState<SubstituteResult | null>(null);
  const exerciceActuel = parcSalle.find((e) => e.id === exerciceId);

  const alternatives = findSubstitutes(parcSalle, {
    pilier,
    profilTension,
    gymId,
    excludeExerciseIds: [exerciceId, ...dejaAuProgramme.filter((id) => id !== exerciceId)],
    musclesAvecCourbatures: musclesCourbatures,
    raison: raison ?? undefined,
    exigerDocumentation: debutant || raison === "trop_complique",
    type: exerciceActuel?.type,
    equipementActuel: exerciceActuel?.equipement,
  });

  const fermer = () => {
    setOuvert(false);
    setRaison(null);
    setEviter(false);
  };

  const appliquer = async (choix: SubstituteResult) => {
    if (!raison || envoi) return;
    setEnvoi(choix.exerciseInstanceId);
    try {
      const res = await fetch("/api/seance-du-jour/substituer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionLogId,
          remplaceInstanceId: exerciceId,
          remplacantInstanceId: choix.exerciseInstanceId,
          raison,
          eviterAlAvenir: eviter,
        }),
      });
      if (!res.ok) throw new Error();
      onRemplace(choix);
      toast.success(`${choix.exerciseName} remplace ${exerciceNom}`);
      fermer();
    } catch {
      // Rien n'est appliqué à l'écran tant que le serveur n'a pas confirmé :
      // une carte qui change sans que la base suive produirait exactement le
      // défaut qu'on corrige.
      toast.error("Remplacement non enregistré");
      setEnvoi(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 text-encre-2 text-xs border border-filet rounded-md px-2.5 py-1.5 bg-papier-2"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden />
        Remplacer
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center" role="dialog" aria-modal="true">
          <div
            className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: "calc(1rem + var(--marge-bas))" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-encre">Remplacer</h2>
                <p className="text-encre-3 text-sm truncate">{exerciceNom}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-encre-2" onClick={fermer}>
                Annuler
              </Button>
            </div>

            {!raison ? (
              <>
                <p className="text-encre-2 text-sm">Pourquoi&nbsp;?</p>
                <div className="space-y-2">
                  {RAISONS.map((r) => (
                    <button
                      key={r.cle}
                      type="button"
                      onClick={() => setRaison(r.cle)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-filet bg-papier-2 text-encre text-sm"
                    >
                      {r.libelle}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {alternatives.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-encre-2 text-sm">
                      {raison === "trop_complique" || debutant
                        ? "Je n’ai pas de remplacement plus simple suffisamment documenté dans cette salle."
                        : "Je n’ai pas d’alternative cohérente disponible dans cette salle."}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-encre-2 text-sm">
                      À la place, dans cette salle&nbsp;:
                    </p>
                    <div className="space-y-2">
                      {alternatives.map((a, index) => (
                        <div
                          key={a.exerciseInstanceId}
                          className={`rounded-xl border p-3 ${index === 0 ? "border-primary bg-primary/5" : "border-filet bg-papier-2"}`}
                        >
                          {index === 0 && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">Recommandé</span>
                          )}
                          <div className="flex items-start gap-3 mt-1">
                            <span className="min-w-0 flex-1">
                              <span className="block text-encre text-sm font-medium truncate">
                              {a.exerciseName}
                              </span>
                              {a.machineName && (
                                <span className="block text-encre-3 text-xs mt-0.5 truncate">{a.machineName}</span>
                              )}
                              <span className="block text-encre-2 text-xs mt-1">{a.raisonCompatibilite}</span>
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => setApercu(a)}
                              className="h-11 rounded-lg border border-filet text-sm text-encre"
                            >
                              Voir comment faire
                            </button>
                            <button
                              type="button"
                              disabled={envoi !== null}
                              onClick={() => void appliquer(a)}
                              className="h-11 rounded-lg bg-encre text-papier text-sm font-medium disabled:opacity-60"
                            >
                              {envoi === a.exerciseInstanceId ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden /> : <>Choisir <Check className="inline w-4 h-4" aria-hidden /></>}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Ton historique ne suit pas : c'est une autre machine, et
                        la charge d'une machine ne se transporte pas. */}
                    <p className="text-encre-3 text-xs">
                      Les charges ne sont pas reprises&nbsp;: chaque machine garde son propre
                      historique.
                    </p>
                  </>
                )}

                <label className="flex items-start gap-3 pt-2 border-t border-filet">
                  <input
                    type="checkbox"
                    checked={eviter}
                    onChange={(e) => setEviter(e.target.checked)}
                    className="mt-1 w-4 h-4 shrink-0"
                  />
                  <span className="text-sm">
                    <span className="block text-encre">Éviter cet exercice à l&apos;avenir</span>
                    <span className="block text-encre-3 text-xs mt-0.5">
                      Sinon, ce remplacement ne vaut que pour aujourd&apos;hui.
                    </span>
                  </span>
                </label>
                {alternatives.length === 0 && (
                  <div className="grid gap-2">
                    {exerciceActuel && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setApercu({
                          exerciseInstanceId: exerciceActuel.id,
                          exerciseId: exerciceActuel.exerciseId,
                          exerciseName: exerciceActuel.nom,
                          machineName: exerciceActuel.machineNom,
                          categorieRole: exerciceActuel.categorieRole,
                          profilTension: exerciceActuel.profilTension,
                          slug: exerciceActuel.slug,
                        })}
                      >
                        Voir la technique de cet exercice
                      </Button>
                    )}
                    {onReporter && (
                      <Button variant="outline" className="w-full" onClick={onReporter}>
                        Faire un autre exercice et y revenir
                      </Button>
                    )}
                    <Button variant="ghost" className="w-full" onClick={fermer}>
                      Garder cet exercice
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {apercu && (
        <ApercuAlternative choix={apercu} onFermer={() => setApercu(null)} />
      )}
    </>
  );
}

function ApercuAlternative({
  choix,
  onFermer,
}: {
  choix: SubstituteResult;
  onFermer: () => void;
}) {
  const [contexte, setContexte] = useState<ContexteExecutionClient | null>(null);
  useEffect(() => {
    if (!choix.exerciseId) return;
    let vivant = true;
    const params = new URLSearchParams({ exerciseId: choix.exerciseId });
    fetch(`/api/execution/${choix.exerciseInstanceId}?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (vivant && c) setContexte(c); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [choix.exerciseId, choix.exerciseInstanceId]);

  if (!contexte) {
    return (
      <div className="fixed inset-0 z-[60] bg-encre/80 flex items-end justify-center">
        <div
          className="bg-carte rounded-t-2xl w-full max-w-md p-5 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={{ paddingBottom: "calc(1rem + var(--marge-bas))" }}
        >
          <p className="text-encre-2 text-sm">Chargement de la technique…</p>
          <Button variant="outline" className="w-full mt-3" onClick={onFermer}>Retour aux choix</Button>
        </div>
      </div>
    );
  }
  return (
    <FicheExecution
      contexte={contexte}
      nom={choix.exerciseName}
      onFermer={onFermer}
      onEnregistre={setContexte}
    />
  );
}
