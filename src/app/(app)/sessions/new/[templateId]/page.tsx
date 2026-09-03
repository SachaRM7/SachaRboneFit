"use client";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RestTimer } from "@/components/session/RestTimer";
import { type ExercicePrescrit } from "@/components/session/types";
import { TableauSeries } from "@/components/session/TableauSeries";
import { BandeauAdaptation } from "@/components/session/BandeauAdaptation";
import { initAudioContext, playBeep } from "@/lib/audio/beep";
import { SOSBar } from "@/components/session/SOSBar";
import { ChangerDeLieu } from "@/components/session/ChangerDeLieu";
import { SOSMachineOccupee } from "@/components/session/SOSMachineOccupee";
import { SOSDouleur } from "@/components/session/SOSDouleur";
import { SOSEnergie } from "@/components/session/SOSEnergie";
import { SOSTempsDepasse } from "@/components/session/SOSTempsDepasse";
import { ProactiveAlert } from "@/components/coach/ProactiveAlert";
import { Feu } from "@/components/carnet/Feu";
import type { ExerciseInstanceWithExercise } from "@/lib/engine/substitutions";
import type { ExerciceRestant } from "@/lib/sos/types";

type ModaleSOS = "machine" | "douleur" | "energie" | "temps" | null;

/** Le rôle vient de la base en texte libre : on le ramène aux trois valeurs du moteur. */
function normaliserRole(role: string | null | undefined): ExerciceRestant["categorie_role"] {
  return role === "pilier" || role === "substitut" ? role : "accessoire";
}

interface SeanceChargee {
  nom: string;
  /** Phase du cycle : la calibration ne demande pas la même chose en séance. */
  phaseCycle?: string | null;
  feuBiologiqueJour?: string | null;
  volumeAjustePct?: number | null;
  volumeAjusteRaison?: string | null;
  exercices: (ExercicePrescrit & { categorieRole?: string; musclesPrincipaux?: string[] })[];
}

export default function PageSeanceLive() {
  return (
    <Suspense fallback={<div className="p-4 text-encre-3">Chargement…</div>}>
      <ContenuSeanceLive />
    </Suspense>
  );
}

/**
 * Écran de séance.
 *
 * Il empilait auparavant TOUS les exercices sur une seule page : le
 * `currentExerciseIndex` du store était mis à jour mais ne pilotait aucun
 * affichage, et le timer de repos ne démarrait jamais — le handler qui le
 * déclenche n'était appelé par aucun composant.
 */
function ContenuSeanceLive() {
  const { templateId } = useParams();
  const searchParams = useSearchParams();
  const gymId = searchParams.get("gymId") || "";
  const sessionId = searchParams.get("sessionId") || "";
  const router = useRouter();

  const {
    active, start,
    startRest, clearRest, extendRest, skipExercises, allegerExercises,
  } = useSessionStore();

  const [seance, setSeance] = useState<SeanceChargee | null>(null);
  const [chargement, setChargement] = useState(true);
  // Distinguer « ce gabarit n'a pas pu être lu » de « ce gabarit est vide ».
  // Les deux menaient au même écran, et le second est un mensonge quand c'est
  // le premier qui s'est produit.
  const [echecLecture, setEchecLecture] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);
  const [audioPret, setAudioPret] = useState(false);
  const [modaleSOS, setModaleSOS] = useState<ModaleSOS>(null);
  // Changer de lieu se décide avant de commencer, pas en pleine série : le
  // panneau reste replié tant qu'on ne le demande pas.
  const [changementDeLieu, setChangementDeLieu] = useState(false);
  const [dureeSOSMin, setDureeSOSMin] = useState(0);
  const [parcSalle, setParcSalle] = useState<ExerciseInstanceWithExercise[]>([]);
  const [musclesCourbatures, setMusclesCourbatures] = useState<string[]>([]);

  // --- Chargement du plan (le template n'est qu'un repli) ---
  useEffect(() => {
    let annule = false;

    const source = sessionId
      ? fetch(`/api/seance-du-jour?sessionLogId=${sessionId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((plan) =>
            plan?.items?.length
              ? {
                  nom: "Séance du jour",
                  feuBiologiqueJour: plan.seance.feuBiologiqueJour,
                  volumeAjustePct: plan.seance.volumeAjustePct,
                  volumeAjusteRaison: plan.seance.volumeAjusteRaison,
                  phaseCycle: plan.phaseCycle ?? null,
                  exercices: plan.items,
                }
              : null,
          )
          .catch(() => null)
      : Promise.resolve(null);

    source
      .then((plan) =>
        plan ??
        fetch(`/api/sessions/${templateId}`)
          // Le repli est le dernier filet : il rend une ligne par exercice
          // programmé, sans consulter ni la salle ni l'état du jour. Sa réponse
          // était lue sans regarder le statut — un 500 donnait un corps
          // `{ error }`, donc `t.exercises` valait `undefined`, donc `[]`, et
          // l'écran annonçait « Aucun exercice dans cette séance ». Une panne
          // serveur se présentait comme un programme vide, et c'est ce qui a
          // fait chercher la cause dans les données pendant des heures.
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`gabarit illisible (${r.status})`))))
          .then((t) => ({ nom: t.nom, exercices: t.exercises ?? [] })),
      )
      .then((s: SeanceChargee) => {
        if (!annule) {
          setSeance(s);
          setChargement(false);
        }
      })
      .catch(() => {
        if (annule) return;
        setEchecLecture(true);
        setChargement(false);
      });

    if (gymId) {
      fetch(`/api/exercise-instances?gymId=${gymId}`)
        .then((r) => r.json())
        .then((d) => !annule && Array.isArray(d) && setParcSalle(d))
        .catch(() => {});
    }

    fetch(`/api/daily-state?date=${new Date().toISOString().slice(0, 10)}`)
      .then((r) => r.json())
      .then((d) => {
        if (annule || !d?.courbatures) return;
        setMusclesCourbatures(
          d.courbatures.filter((c: { intensite: number }) => c.intensite >= 7)
            .map((c: { muscle: string }) => c.muscle),
        );
      })
      .catch(() => {});

    return () => { annule = true; };
  }, [templateId, gymId, sessionId]);

  // --- Le store doit porter l'identifiant réel de la ligne session_logs ---
  useEffect(() => {
    if (active || !seance) return;

    if (sessionId) {
      start({ id: sessionId, seanceTemplateId: templateId as string, gymId });
      return;
    }

    let annule = false;
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        seanceTemplateId: templateId,
        gymId: gymId || null,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((s: { id: string }) => {
        if (!annule) start({ id: s.id, seanceTemplateId: templateId as string, gymId });
      })
      .catch(() => !annule && toast.error("Impossible de démarrer la séance"));

    return () => { annule = true; };
  }, [seance, active, sessionId, templateId, gymId, start]);

  const interaction = useCallback(async () => {
    if (!audioPret) {
      await initAudioContext();
      setAudioPret(true);
    }
  }, [audioPret]);

  // --- Repos : déclenché à chaque série validée ---
  const lancerRepos = (reposSecondes: number | null) => {
    if (!reposSecondes || reposSecondes <= 0) return;
    startRest(reposSecondes, active?.currentExerciseIndex ?? 0);
    setTimerVisible(true);
  };

  const fermerTimer = () => {
    clearRest();
    setTimerVisible(false);
  };

  const enregistrerIncident = async (data: { type: string; contexte: Record<string, unknown>; decision: string }) => {
    if (!active?.id) return;
    try {
      // Possible depuis que le store porte l'identifiant réel : cet appel
      // renvoyait auparavant 403 à chaque fois, en silence.
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_log_id: active.id,
          type: data.type,
          contexte: data.contexte,
          decision: data.decision,
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Incident non enregistré");
    }
  };

  if (chargement) return <div className="p-4 text-encre-3">Chargement…</div>;
  if (echecLecture) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-perte font-semibold">Je n&apos;ai pas pu lire cette séance</p>
        <p className="text-encre-2 text-sm">
          Ton programme n&apos;est pas en cause : c&apos;est la lecture qui a échoué.
          Réessaie — si ça persiste, c&apos;est côté serveur.
        </p>
        <Button variant="outline" className="w-full border-filet bg-carte text-encre"
          onClick={() => router.refresh()}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (!seance) return <div className="p-4 text-encre-3">Séance introuvable</div>;

  const exercicesSkippes = active?.skippedExerciseIds ?? [];
  const reductionsRPE = active?.rpeReductions ?? {};
  const visibles = seance.exercices.filter((e) => !exercicesSkippes.includes(e.id));
  // Toute la séance étant affichée, il n'y a plus d'exercice « courant » au sens
  // d'une navigation. Celui qui compte pour les SOS et le décompte est le
  // premier dont les séries ne sont pas toutes validées.
  const seriesValidees = (id: string) =>
    (active?.sets ?? []).filter((s) => s.exerciseInstanceId === id).length;
  const premierNonTermine = visibles.findIndex((e) => seriesValidees(e.id) < e.seriesCibles);
  const index = premierNonTermine === -1 ? Math.max(0, visibles.length - 1) : premierNonTermine;
  const courant = visibles[index];
  const termines = visibles.filter((e) => seriesValidees(e.id) >= e.seriesCibles).length;

  const restants: ExerciceRestant[] = visibles.slice(index).map((e, i) => ({
    exercise_instance_id: e.id,
    nom: e.nom,
    muscles_principaux: e.musclesPrincipaux ?? [],
    categorie_role: normaliserRole(e.categorieRole),
    statut: i === 0 ? ("en_cours" as const) : ("à_venir" as const),
    ordre: index + i + 1,
  }));

  return (
    <div className="min-h-screen bg-papier pb-40" onPointerDown={interaction}>
      {/* Déclaré pour que l'entrée du coach s'efface : pendant la séance, ce
          sont les actions immédiates de la barre SOS qui servent. */}
      <DeclarerContexte ecran="seance" />
      <header className="sticky top-0 z-20 bg-papier border-b border-filet px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" aria-label="Quitter la séance"
              onClick={() => router.push("/")}>
              <ArrowLeft className="w-5 h-5 text-encre-2" />
            </Button>
            <h1 className="text-lg font-semibold text-encre truncate">{seance.nom}</h1>
          </div>
          <span className="flex items-center gap-2 text-xs text-encre-3 shrink-0">
            <Feu niveau={seance.feuBiologiqueJour} />
            <span className="chiffres">{termines}/{visibles.length}</span> exercices
          </span>
        </div>
      </header>

      {/* L'ajustement était calculé, stocké, puis jamais montré — et seul le
          volume l'était, jamais les substitutions ni les charges en hausse. */}
      <BandeauAdaptation
        feuJour={seance.feuBiologiqueJour}
        volumeAjustePct={seance.volumeAjustePct}
        volumeAjusteRaison={seance.volumeAjusteRaison}
        exercices={visibles}
      />

      <div className="px-4 pt-4 space-y-3">
        <ProactiveAlert onShowSOS={() => setModaleSOS("energie")} />

        {sessionId && gymId && (
          changementDeLieu ? (
            <div className="rounded-xl border border-filet bg-carte p-4">
              <ChangerDeLieu
                sessionLogId={sessionId}
                lieuActuelId={gymId}
                onApplique={() => {
                  setChangementDeLieu(false);
                  window.location.reload();
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setChangementDeLieu(true)}
              className="text-encre-2 text-sm underline underline-offset-4"
            >
              Je m&apos;entraîne ailleurs aujourd&apos;hui
            </button>
          )
        )}
      </div>

      {/* La séance entière tient dans une page défilante : on voit ce qui reste
          sans naviguer, et corriger une série faite plus tôt ne demande pas de
          revenir en arrière. */}
      <main className="px-4 py-4 space-y-3">
        {visibles.length > 0 ? (
          visibles.map((exercice) => (
            <TableauSeries
              key={exercice.id}
              exercice={exercice}
              rpeReduction={reductionsRPE[exercice.id] ?? 0}
              modeReserve={seance.phaseCycle === "calibration"}
              onSerieValidee={lancerRepos}
            />
          ))
        ) : (
          <p className="text-encre-3">Aucun exercice dans cette séance.</p>
        )}
      </main>

      <div className="px-4 mt-5">
        <Button variant="outline" className="w-full border-filet bg-carte text-encre-2"
          onClick={() => router.push(`/sessions/new/${templateId}/finish`)}>
          Terminer la séance
        </Button>
      </div>

      {/* La rangée SOS était posée en bottom-0, sous une barre de navigation
          fixée au même endroit et de z-index supérieur : elle était donc
          entièrement recouverte, invisible pendant toute la séance. Elle se
          place au-dessus, à la hauteur exacte de cette barre. */}
      <div className="fixed bottom-16 left-0 right-0 bg-papier border-t border-filet px-4 py-2 z-30">
        <SOSBar
          onMachineOccupee={() => setModaleSOS("machine")}
          onDouleur={() => setModaleSOS("douleur")}
          onEnergie={() => setModaleSOS("energie")}
          onTempsDepasse={() => {
            setDureeSOSMin(active ? Math.floor((Date.now() - active.startedAt) / 60000) : 0);
            setModaleSOS("temps");
          }}
        />
      </div>

      {timerVisible && active?.restDurationSeconds && (
        <div className="fixed inset-0 z-50 bg-encre/80 flex items-center justify-center p-4">
          <div className="bg-carte rounded-xl border border-filet">
            <RestTimer
              durationSeconds={active.restDurationSeconds}
              onComplete={playBeep}
              onSkip={fermerTimer}
              onExtend={extendRest}
            />
          </div>
        </div>
      )}

      {modaleSOS === "machine" && courant && (
        <SOSMachineOccupee
          exerciseInstanceId={courant.id}
          gymId={gymId}
          allInstances={parcSalle}
          templateExerciseIds={visibles.map((e) => e.id)}
          musclesCourbatures={musclesCourbatures}
          onClose={() => setModaleSOS(null)}
          onSubstitute={(_id, nom) => {
            toast.success(`${nom} utilisé à la place`);
            setModaleSOS(null);
          }}
        />
      )}

      {modaleSOS === "douleur" && (
        <SOSDouleur
          exercicesRestants={restants}
          sessionLogId={active?.id ?? ""}
          onClose={() => setModaleSOS(null)}
          onStopSeance={() => router.push(`/sessions/new/${templateId}/finish`)}
          onSkipExercices={(ids) => {
            skipExercises(ids);
            toast.success(`${ids.length} exercice(s) retiré(s)`);
          }}
          onAllegerExercices={(ids) => {
            allegerExercises(ids);
            toast.success(`Effort allégé sur ${ids.length} exercice(s)`);
          }}
          onIncident={enregistrerIncident}
        />
      )}

      {modaleSOS === "energie" && (
        <SOSEnergie
          exercicesRestants={restants}
          onClose={() => setModaleSOS(null)}
          onStopSeance={() => router.push(`/sessions/new/${templateId}/finish`)}
          onApply={(coupes, rpeReduit) => {
            const idParNom = new Map(visibles.map((e) => [e.nom, e.id]));
            skipExercises(coupes.map((n) => idParNom.get(n)).filter((id): id is string => Boolean(id)));
            // Le RPE réduit était reçu puis ignoré.
            allegerExercises(rpeReduit.map((n) => idParNom.get(n)).filter((id): id is string => Boolean(id)));
            toast.success("Séance ajustée");
          }}
          onIncident={enregistrerIncident}
        />
      )}

      {modaleSOS === "temps" && (
        <SOSTempsDepasse
          dureeActuelleMin={dureeSOSMin}
          dureeCibleMin={60}
          exercicesRestants={restants}
          onClose={() => setModaleSOS(null)}
          onApply={(coupes) => {
            const idParNom = new Map(visibles.map((e) => [e.nom, e.id]));
            skipExercises(coupes.map((n) => idParNom.get(n)).filter((id): id is string => Boolean(id)));
            toast.success("Coupes appliquées");
          }}
          onIncident={enregistrerIncident}
        />
      )}
    </div>
  );
}
