"use client";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionStore, type DraftSet } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RestTimer } from "@/components/session/RestTimer";
import { type ExercicePrescrit } from "@/components/session/types";
import { TableauSeries } from "@/components/session/TableauSeries";
import { VueFocus } from "@/components/session/VueFocus";
import { SelecteurVue } from "@/components/session/SelecteurVue";
import {
  avancement, exerciceAffiche, CLE_VUE_LIVE, vueParDefaut,
  ligneeDe, slotsARemplir, avancementDeLaLignee, type VueLive,
} from "@/lib/live/vue-live";
import { BandeauAdaptation } from "@/components/session/BandeauAdaptation";
import { initAudioContext, playBeep } from "@/lib/audio/beep";
import { SOSBar } from "@/components/session/SOSBar";
import { ChangerDeLieu } from "@/components/session/ChangerDeLieu";
import { SOSMachineOccupee } from "@/components/session/SOSMachineOccupee";
import { RemplacerExercice } from "@/components/session/RemplacerExercice";
import { SOSDouleur } from "@/components/session/SOSDouleur";
import { SOSEnergie } from "@/components/session/SOSEnergie";
import { SOSEtat } from "@/components/session/SOSEtat";
import { envoyerIncident } from "@/components/session/incident-en-vol";
import { SOSSymptome } from "@/components/session/SOSSymptome";
import { SOSTempsDepasse } from "@/components/session/SOSTempsDepasse";
import { ProactiveAlert } from "@/components/coach/ProactiveAlert";
import { ObservateurSeance } from "@/components/session/ObservateurSeance";
import { ChronoSeance } from "@/components/session/ChronoSeance";
import { Feu } from "@/components/carnet/Feu";
import { modeSaisieEffort } from "@/lib/engine/reserve";
import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";
import type { ExerciceRestant } from "@/lib/sos/types";
import type { ExerciceAvecMuscles } from "@/lib/sos/douleur";

/*
 * `etat` est le CHOISISSEUR, `energie` et `symptome` les deux destinations.
 *
 * Trois états plutôt que deux parce que les deux écrans d'arrivée restent
 * distincts : une baisse d'énergie et une nausée ne se saisissent pas de la
 * même façon, et ne s'enregistrent pas dans le même type d'incident.
 */
type ModaleSOS = "machine" | "douleur" | "etat" | "energie" | "symptome" | "temps" | null;

/** Le rôle vient de la base en texte libre : on le ramène aux trois valeurs du moteur. */
function normaliserRole(role: string | null | undefined): ExerciceRestant["categorie_role"] {
  return role === "pilier" || role === "substitut" ? role : "accessoire";
}

interface SeanceChargee {
  nom: string;
  /** Durées déclarées à l'onboarding, pour le chronomètre de séance. */
  dureeCibleMinutes?: number | null;
  dureeMaxMinutes?: number | null;
  /** Phase du cycle : la calibration ne demande pas la même chose en séance. */
  phaseCycle?: string | null;
  feuBiologiqueJour?: string | null;
  volumeAjustePct?: number | null;
  volumeAjusteRaison?: string | null;
  exercices: (ExercicePrescrit & {
    categorieRole?: string;
    musclesPrincipaux?: string[];
    /** La lignée du slot, telle que le serveur la connaît. Voir `lirePlan`. */
    lignee?: string[];
  })[];
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
    active, start, hydraterSets, hydraterLignees, setCurrentExerciseIndex, noterSubstitution,
    startRest, clearRest, skipRest, extendRest, skipExercises, allegerExercises,
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

  /*
   * La vue choisie — Focus par défaut, retenue localement.
   *
   * Localement, parce qu'elle décrit un APPAREIL et un moment, pas une
   * personne : on veut Focus sur le téléphone en salle et souvent Liste sur un
   * écran large. En faire un réglage de compte imposerait de le synchroniser
   * et de le migrer pour une valeur qui change en changeant d'écran.
   *
   * `useState` avec initialisation paresseuse : `localStorage` n'existe pas au
   * rendu serveur, et le lire pendant le rendu produirait une hydratation
   * incohérente.
   */
  const [vue, setVue] = useState<VueLive>("focus");
  useEffect(() => {
    try {
      setVue(vueParDefaut(window.localStorage.getItem(CLE_VUE_LIVE)));
    } catch {
      // Navigation privée, stockage refusé : Focus reste le défaut.
    }
  }, []);

  const choisirVue = (v: VueLive) => {
    setVue(v);
    try {
      window.localStorage.setItem(CLE_VUE_LIVE, v);
    } catch {
      // La préférence ne survivra pas au rechargement, la séance si.
    }
  };
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
                  dureeCibleMinutes: plan.dureeCibleMinutes ?? null,
                  dureeMaxMinutes: plan.dureeMaxMinutes ?? null,
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
          .then((t) => ({
            nom: t.nom,
            // Sans elle, une calibration ouverte par le repli réclamait un RPE.
            phaseCycle: t.phaseCycle ?? null,
            exercices: t.exercises ?? [],
          })),
      )
      .then((s: SeanceChargee) => {
        if (!annule) {
          setSeance(s);
          /*
           * Les lignées viennent du plan SERVEUR, pas seulement du brouillon.
           *
           * Le store persisté suffisait à un rafraîchissement ; il ne survit
           * pas à un `localStorage` purgé. Or les séries reviennent bien de
           * Postgres : sans cette ligne, la machine substituée repartait à 0/3
           * alors qu'une série avait été soulevée sur l'ancienne.
           */
          hydraterLignees(
            s.exercices.map((e) => e.lignee ?? []).filter((l) => l.length > 1),
          );
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
    // `hydraterLignees` vient de Zustand : sa référence est stable pour la vie
    // du store. L'ajouter ne changerait rien et relancerait le chargement de la
    // séance à la moindre recréation du store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, gymId, sessionId]);

  /**
   * Le store doit porter l'identifiant réel de la ligne `session_logs`.
   *
   * Il le CRÉAIT aussi, et c'est ce qui a produit la séance fantôme : arriver
   * sur cet écran sans `sessionId` déclenchait un `POST /api/sessions` depuis
   * un effet de rendu. Aucun geste, aucune intention — un simple affichage
   * suffisait à ouvrir une séance en base. Après la clôture d'une vraie
   * calibration, une redirection parasite est passée par ici et a créé une
   * « Calibration B — 0/6 exercices » immédiatement après l'enregistrement.
   *
   * Il ne reste donc que le rattachement. La création demande un geste, plus
   * bas, et rien ne naît d'un rendu.
   */
  useEffect(() => {
    if (active || !seance || !sessionId) return;
    start({ id: sessionId, seanceTemplateId: templateId as string, gymId });
  }, [seance, active, sessionId, templateId, gymId, start]);

  /**
   * Ouvrir la séance, sur demande explicite.
   *
   * C'est le seul chemin de création restant depuis cet écran. Le chemin
   * normal reste `/session/start`, qui construit le plan du jour et transmet
   * l'identifiant dans l'URL ; celui-ci sert quand on atterrit ici sans être
   * passé par là.
   */
  const [ouverture, setOuverture] = useState(false);
  const demarrer = useCallback(async () => {
    if (ouverture) return;
    setOuverture(true);
    try {
      const date = new Date().toISOString().slice(0, 10);

      /*
       * Ouvrir une séance, c'est CONSTRUIRE son plan — pas seulement écrire
       * une ligne.
       *
       * Première version de ce bouton : un `POST /api/sessions`, qui ne crée
       * que la ligne `session_logs`. La séance existait donc sans plan, et
       * l'écran retombait sur la lecture du gabarit — le chemin de repli, sans
       * charges suggérées ni prescription du jour. On avait remplacé une
       * création non demandée par une création incomplète.
       *
       * Le chemin normal, `/session/start`, appelle le constructeur. Celui-ci
       * fait la même chose, avec le même service : deux portes, une seule
       * façon d'ouvrir une séance.
       */
      if (gymId) {
        const res = await fetch("/api/seance-du-jour", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, gymId, seanceTemplateId: templateId }),
        });
        if (!res.ok) throw new Error();
        const resultat: { seance: { id: string } } = await res.json();
        start({ id: resultat.seance.id, seanceTemplateId: templateId as string, gymId });

        /*
         * L'identifiant part dans l'URL, et ce n'est pas cosmétique.
         *
         * Sans lui, un rechargement ne retrouvait la séance que par le
         * brouillon persisté dans le navigateur : vidé, expiré ou ouvert dans
         * un autre onglet, l'écran aurait proposé de démarrer une seconde fois
         * ce qui existait déjà. Et l'écran serait resté sur la lecture de
         * repli, alors que le plan vient d'être construit.
         *
         * Avec l'identifiant dans l'adresse, la reprise ne dépend plus de rien
         * d'autre — c'est ce que fait `/session/start` depuis toujours.
         */
        const params = new URLSearchParams({ gymId, sessionId: resultat.seance.id });
        router.replace(`/sessions/new/${templateId}?${params.toString()}`);
        return;
      }

      /*
       * Sans lieu connu, on ne peut pas construire de plan : le parc décide de
       * ce qui est faisable. On ouvre alors la séance telle quelle, comme
       * avant — l'écran lira le gabarit, et rien n'est perdu.
       */
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, seanceTemplateId: templateId, gymId: null }),
      });
      if (!res.ok) throw new Error();
      const creee: { id: string } = await res.json();
      start({ id: creee.id, seanceTemplateId: templateId as string, gymId });
      router.replace(`/sessions/new/${templateId}?sessionId=${creee.id}`);
    } catch {
      toast.error("Impossible de démarrer la séance");
      setOuverture(false);
    }
  }, [ouverture, templateId, gymId, start, router]);

  /**
   * Le pilier et le profil de l'exercice affiché.
   *
   * Le plan ne les transporte pas — il décrit une prescription, pas un
   * mouvement. On les retrouve dans le parc de la salle, qui les porte depuis
   * que sa lecture joint `exercises`.
   */
  const pilierDe = (e: ExercicePrescrit) =>
    parcSalle.find((i) => i.id === e.id)?.pilier ?? "";
  const profilDe = (e: ExercicePrescrit) =>
    parcSalle.find((i) => i.id === e.id)?.profilTension ?? "";

  /**
   * La carte devient le nouvel exercice, une fois le serveur d'accord.
   *
   * Ce qui SUIT la substitution : les séries, qui s'enregistreront sous la
   * nouvelle instance — c'est tout l'objet du remplacement. Ce qui ne suit
   * pas : la charge suggérée et l'historique. Ils appartiennent à l'appareil
   * qu'on quitte, et les recopier ferait croire à une continuité qui n'existe
   * pas entre deux machines.
   *
   * La prescription, elle, se conserve : on remplace un mouvement, pas un
   * volume de travail.
   */
  const remplacer = (ancienId: string, choix: SubstituteResult) => {
    const instance = parcSalle.find((i) => i.id === choix.exerciseInstanceId);
    /*
     * La lignée d'abord : elle retient que ce SLOT de prescription a déjà été
     * occupé par l'ancienne machine.
     *
     * Sans elle, la nouvelle repartait à 0/3 alors qu'une série avait été
     * soulevée — trois séries prescrites, quatre réalisées. Et comme elle vit
     * dans le store persisté, un rafraîchissement ne la perd pas.
     */
    noterSubstitution(ancienId, choix.exerciseInstanceId);
    setSeance((s) =>
      s
        ? {
            ...s,
            exercices: s.exercices.map((e) =>
              e.id !== ancienId
                ? e
                : {
                    ...e,
                    id: choix.exerciseInstanceId,
                    exerciseId: instance?.exerciseId ?? null,
                    nom: choix.exerciseName,
                    machineNom: choix.machineName ?? "",
                    slug: instance?.slug ?? null,
                    musclesPrincipaux: instance?.musclesPrincipaux ?? [],
                    conventionCharge: instance?.conventionCharge ?? null,
                    natureCharge: instance?.natureCharge ?? null,
                    incrementsPossibles: instance?.incrementsPossibles ?? [],
                    poidsNonCompte: instance?.poidsNonCompte ?? null,
                    chargeSuggeree: null,
                    repsSuggerees: null,
                    messageProgression: null,
                    motifProgression: null,
                    historique: [],
                    raisonSubstitution: `À la place de ${e.nom}`,
                  },
            ),
          }
        : s,
    );
  };

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

  /** Le repos arrive à son terme : on referme, sans rien signaler de plus. */
  const fermerTimer = () => {
    clearRest();
    setTimerVisible(false);
  };

  /**
   * « Passer » : le repos est écourté volontairement.
   *
   * Le geste appelait `clearRest`, indistinguable d'une fermeture ordinaire —
   * skipper trois repos de 120 s ne laissait donc aucune trace exploitable
   * pendant la séance.
   */
  const passerRepos = () => {
    skipRest();
    setTimerVisible(false);
  };

  /*
   * Consigner un incident, sans jamais retenir personne.
   *
   * La version précédente postait avec un `fetch` ORDINAIRE. Une requête
   * ordinaire est liée au document qui l'a émise : quand le geste qui la
   * déclenche est suivi d'une navigation — « Terminer la séance » pousse vers
   * `/finish` — le navigateur l'annule, et sur Safari mobile presque toujours.
   *
   * Le symptôme le plus sérieux d'une séance était donc aussi le seul à pouvoir
   * se perdre. `envoyerIncident` poste en `keepalive` et rend la main
   * immédiatement : la requête survit au démontage, l'arrêt n'attend rien.
   *
   * Synchrone, et sans valeur de retour : aucun appelant ne peut l'attendre.
   */
  /*
   * La reprise : ce que la BASE porte fait autorité.
   *
   * Le brouillon local protège déjà d'un rafraîchissement. Il ne protège pas
   * d'un `localStorage` vidé — navigation privée, nettoyage iOS sous pression
   * mémoire, autre appareil. On relit donc les séries déjà persistées et on
   * complète le brouillon avec celles qu'il ignore.
   *
   * Une seule requête, après le premier rendu : elle ne retarde pas l'accès à
   * la première série.
   */
  useEffect(() => {
    if (!active?.id) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/session-logs/${active.id}/series`);
        if (!res.ok || annule) return;
        const lignes: DraftSet[] = await res.json();
        if (Array.isArray(lignes) && lignes.length > 0) hydraterSets(lignes);
      } catch {
        // Hors ligne : le brouillon local reste, et la clôture réécrira tout.
      }
    })();
    return () => { annule = true; };
    // Une seule fois par séance : `active.id` ne change pas en cours de route.
  }, [active?.id, hydraterSets]);

  const enregistrerIncident = (data: { type: string; contexte: Record<string, unknown>; decision: string }): void => {
    // Possible depuis que le store porte l'identifiant réel : cet appel
    // renvoyait auparavant 403 à chaque fois, en silence.
    if (!active?.id) return;
    envoyerIncident(
      { sessionLogId: active.id, ...data },
      // Les SOS qui ne naviguent pas restent à l'écran : ils peuvent encore
      // être prévenus. Sur le chemin de l'arrêt, ce toast tombe après la
      // navigation — et dire que le signalement n'est pas passé reste utile.
      { onEchec: () => toast.error("Incident non enregistré") },
    );
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

  /*
   * Rien n'a encore été ouvert : on demande, on ne décide pas.
   *
   * Ce que l'écran montre ici est le programme, pas une séance en cours — et
   * la base ne porte aucune ligne tant que le bouton n'a pas été touché.
   */
  if (!active && !sessionId) {
    return (
      <div className="min-h-dvh bg-papier text-encre p-4 space-y-4">
        <DeclarerContexte ecran="seance" />
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-encre-3">Prête à démarrer</p>
          <h1 className="text-2xl font-bold">{seance.nom}</h1>
          <p className="text-encre-2 text-sm">
            <span className="chiffres">{seance.exercices.length}</span> exercice
            {seance.exercices.length > 1 ? "s" : ""} au programme.
          </p>
        </div>

        <ul className="rounded-xl border border-filet bg-carte divide-y divide-filet">
          {seance.exercices.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <p className="text-encre text-sm font-medium">{e.nom}</p>
              {e.machineNom && <p className="text-encre-3 text-xs mt-0.5">{e.machineNom}</p>}
            </li>
          ))}
        </ul>

        <Button
          className="w-full h-12 text-base bg-encre text-papier hover:bg-filet"
          disabled={ouverture}
          onClick={() => void demarrer()}
        >
          {ouverture ? "Ouverture…" : "Démarrer la séance"}
        </Button>
        <p className="text-encre-3 text-xs text-center">
          Rien n&apos;est enregistré tant que tu n&apos;as pas commencé.
        </p>
      </div>
    );
  }

  const exercicesSkippes = active?.skippedExerciseIds ?? [];
  const reductionsRPE = active?.rpeReductions ?? {};
  const visibles = seance.exercices.filter((e) => !exercicesSkippes.includes(e.id));

  /*
   * L'avancement est calculé UNE fois, et les deux vues le lisent.
   *
   * Focus et Liste montrent la même séance : si chacune déduisait de son côté
   * « où en est-on », elles finiraient par se contredire — 2/3 ici, 3/3 là.
   * Toute cette logique vit dans `lib/live/vue-live.ts`, hors de React et
   * testée pour elle-même.
   */
  const etats = avancement(
    visibles.map((e) => ({ id: e.id, nom: e.nom, seriesCibles: e.seriesCibles })),
    active?.sets ?? [],
    // Après substitution, les séries faites sur l'ancienne machine comptent
    // pour le slot : la liste compacte doit dire 1/3, pas 0/3.
    active?.lignees ?? [],
  );

  /*
   * `currentExerciseIndex` redevient une VRAIE navigation.
   *
   * Il disait auparavant « le premier exercice non terminé », recalculé à
   * chaque rendu : ouvrir le 4 pour préparer sa machine renvoyait au 2 dès la
   * série suivante. Il porte maintenant ce que la personne a choisi de
   * regarder, et `exerciceAffiche` ne le corrige que s'il ne désigne plus rien.
   */
  const index = exerciceAffiche(etats, active?.currentExerciseIndex ?? null);
  const courant = visibles[index];
  const termines = etats.filter((e) => e.statut === "termine").length;

  /*
   * Les actions d'un exercice — montées UNE fois, employées par les deux vues.
   *
   * Le remplacement a besoin du parc de la salle et de la séance en cours, que
   * `TableauSeries` ne connaît pas et n'a pas à connaître. Écrire ce bloc deux
   * fois — une par vue — aurait suffi à ce que les deux divergent : une
   * substitution possible en Liste et pas en Focus, sans que rien ne le dise.
   */
  /*
   * Les numéros de série que CETTE entrée doit encore demander.
   *
   * Après une substitution, ce n'est plus « 1 à seriesCibles » : les slots
   * consommés sur l'ancienne machine sont retirés, et les numéros restants
   * gardent leur valeur d'origine — la série 2 reste la série 2.
   */
  const slotsDe = (exercice: (typeof visibles)[number]) =>
    slotsARemplir(
      ligneeDe(active?.lignees ?? [], exercice.id),
      active?.sets ?? [],
      exercice.seriesCibles,
    );

  /** L'avancement du slot, toutes machines confondues. */
  const avancementDe = (exercice: (typeof visibles)[number]) =>
    avancementDeLaLignee(
      ligneeDe(active?.lignees ?? [], exercice.id),
      active?.sets ?? [],
      exercice.seriesCibles,
    );

  const actionsDeLExercice = (exercice: (typeof visibles)[number]) =>
    active?.id && gymId ? (
      <RemplacerExercice
        sessionLogId={active.id}
        exerciceId={exercice.id}
        exerciceNom={exercice.nom}
        pilier={pilierDe(exercice)}
        profilTension={profilDe(exercice)}
        gymId={gymId}
        parcSalle={parcSalle}
        dejaAuProgramme={visibles.map((e) => e.id)}
        musclesCourbatures={musclesCourbatures}
        onRemplace={(r) => remplacer(exercice.id, r)}
      />
    ) : null;

  const restants: ExerciceAvecMuscles[] = visibles.slice(index).map((e, i) => ({
    exercise_instance_id: e.id,
    nom: e.nom,
    muscles_principaux: e.musclesPrincipaux ?? [],
    // Sans eux, la douleur ne pourrait pas distinguer une zone visée d'une
    // zone seulement traversée — et retirerait tout ce qui la touche.
    muscles_secondaires: e.musclesSecondaires ?? undefined,
    categorie_role: normaliserRole(e.categorieRole),
    statut: i === 0 ? ("en_cours" as const) : ("à_venir" as const),
    ordre: index + i + 1,
  }));

  return (
    /*
     * Le bas de la séance porte DEUX barres — la rangée SOS, puis la
     * navigation. Le layout dégage déjà la seconde, marge du bas comprise ;
     * cet écran n'a donc à dégager que la première. `pb-40` les comptait
     * toutes les deux à la main, en double avec le layout et sans marge : la
     * dernière série d'une séance longue passait sous la rangée SOS, ce qui
     * est exactement le moment où elle compte.
     */
    <div
      className="min-h-screen bg-papier"
      /*
       * Le dégagement vient d'une variable partagée, pas d'un `pb-16`.
       *
       * `pb-16` valait 4 rem quand la rangée SOS en mesure 4,75 : la dernière
       * série d'une séance longue passait sous la barre. Et la valeur était
       * recopiée là plutôt que calculée — sur un appareil sans encoche comme
       * sur un iPhone, c'était le même nombre pour deux réalités.
       */
      style={{ paddingBottom: "var(--degagement-live)" }}
      onPointerDown={interaction}
    >
      {/* Déclaré pour que l'entrée du coach s'efface : pendant la séance, ce
          sont les actions immédiates de la barre SOS qui servent. */}
      <DeclarerContexte ecran="seance" />
      {/* Collé sous l'encoche, pas sous l'heure : à `top-0`, l'en-tête de la
          séance — nom de la séance, chrono, bouton quitter — glissait derrière
          la barre d'état dès le premier défilement. */}
      <header
        className="sticky z-20 bg-papier border-b border-filet px-4 py-3"
        style={{ top: "var(--marge-haut)" }}
      >
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

      {/* Le temps écoulé, discrètement. Il n'existait pas : les durées idéale
          et maximale de l'onboarding n'étaient relues nulle part. */}
      {active?.startedAt && (
        <ChronoSeance
          demarreeA={active.startedAt}
          dureeCibleMinutes={seance.dureeCibleMinutes}
          dureeMaxMinutes={seance.dureeMaxMinutes}
        />
      )}

      {/*
        Le Coach regarde la séance pendant qu'elle a lieu. Ce que le moteur
        retient — et lui seul décide quoi — s'affiche ici, sans appel au modèle.
      */}
      <ObservateurSeance
        prescriptions={visibles.map((e) => ({
          exerciseInstanceId: e.id,
          seriesCibles: e.seriesCibles,
          fourchetteRepsMin: e.fourchetteRepsMin,
          fourchetteRepsMax: e.fourchetteRepsMax,
          rpeCible: e.rpeCible,
          reposSecondes: e.reposSecondes,
        }))}
        ordreDesExercices={visibles.map((e) => e.id)}
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
        {/*
          Le sélecteur ne change pas d'écran : il change ce qui est rendu. Rien
          n'est rechargé, aucun brouillon ne se perd, le minuteur continue.
        */}
        {visibles.length > 0 && (
          <div className="flex justify-end">
            <SelecteurVue vue={vue} onChanger={choisirVue} />
          </div>
        )}

        {visibles.length === 0 ? (
          <p className="text-encre-3">Aucun exercice dans cette séance.</p>
        ) : vue === "focus" ? (
          <VueFocus
            exercices={visibles}
            etats={etats}
            courant={index}
            onNaviguer={setCurrentExerciseIndex}
            rpeReduction={(id) => reductionsRPE[id] ?? 0}
            modeReserve={modeSaisieEffort(seance.phaseCycle) === "reserve"}
            onSerieValidee={lancerRepos}
            actions={actionsDeLExercice}
            slotsDe={slotsDe}
            avancementDe={avancementDe}
          />
        ) : (
          /* La vue Liste, inchangée : toute la séance d'un coup, pour scanner
             ce qui reste ou corriger plusieurs séries d'affilée. */
          visibles.map((exercice) => (
            <TableauSeries
              key={exercice.id}
              exercice={exercice}
              rpeReduction={reductionsRPE[exercice.id] ?? 0}
              modeReserve={modeSaisieEffort(seance.phaseCycle) === "reserve"}
              onSerieValidee={lancerRepos}
              actions={actionsDeLExercice(exercice)}
              slots={slotsDe(exercice)}
              avancementSlot={avancementDe(exercice)}
            />
          ))
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
          place au-dessus, à la hauteur exacte de cette barre.

          « À la hauteur exacte » avait été écrit 4 rem en dur. C'est la
          hauteur de la rangée tactile, pas celle de la barre : sur un iPhone
          à indicateur d'accueil, la barre en fait une trentaine de pixels de
          plus, et la rangée SOS repassait à cheval sur elle — le défaut que
          ce commentaire annonçait avoir corrigé. Elle se réfère maintenant à
          la hauteur réelle. */}
      <div
        className="fixed left-0 right-0 bg-papier border-t border-filet px-4 py-2 z-30"
        style={{ bottom: "var(--barre-nav)" }}
      >
        <SOSBar
          onMachineOccupee={() => setModaleSOS("machine")}
          onDouleur={() => setModaleSOS("douleur")}
          onEtat={() => setModaleSOS("etat")}
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
              onSkip={passerRepos}
              onExtend={extendRest}
            />
          </div>
        </div>
      )}

      {modaleSOS === "machine" && courant && (
        <SOSMachineOccupee
          exercicesDeLaSeance={visibles.map((e) => ({
            id: e.id,
            nom: e.nom,
            machineNom: e.machineNom,
            seriesFaites: (active?.sets ?? []).filter((s) => s.exerciseInstanceId === e.id).length,
            seriesCibles: e.seriesCibles,
          }))}
          exerciseInstanceId={courant.id}
          gymId={gymId}
          allInstances={parcSalle}
          templateExerciseIds={visibles.map((e) => e.id)}
          musclesCourbatures={musclesCourbatures}
          onClose={() => setModaleSOS(null)}
          /*
             Le remplacement s'APPLIQUE, maintenant.

             Ce gestionnaire affichait une notification et refermait la
             fenêtre : la carte ne changeait pas, et les séries continuaient de
             s'enregistrer sous l'exercice qu'on venait de renoncer à faire.
             Le dépannage passe par la même route que le bouton « Remplacer »
             de la carte, avec la raison qui lui correspond.
          */
          onSubstitute={(id, nom) => {
            const remplace = courant.id;
            setModaleSOS(null);
            void (async () => {
              try {
                const res = await fetch("/api/seance-du-jour/substituer", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionLogId: active?.id,
                    remplaceInstanceId: remplace,
                    remplacantInstanceId: id,
                    raison: "occupee",
                  }),
                });
                if (!res.ok) throw new Error();
                const instance = parcSalle.find((i) => i.id === id);
                remplacer(remplace, {
                  exerciseInstanceId: id,
                  exerciseName: nom,
                  machineName: instance?.machineNom ?? null,
                  categorieRole: instance?.categorieRole ?? "accessoire",
                  profilTension: instance?.profilTension ?? "",
                });
                toast.success(`${nom} utilisé à la place`);
              } catch {
                toast.error("Remplacement non enregistré");
              }
            })();
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
          /* Pas d'`onIncident` ici, et c'est la correction du lot : la douleur
             passe par `/api/douleur`, qui consigne l'incident ET rend ce que la
             règle en dit. La route générique `/api/incidents` n'a pas de suite
             à rendre — elle reste celle des trois autres SOS. */
        />
      )}

      {modaleSOS === "etat" && (
        <SOSEtat
          onEnergie={() => setModaleSOS("energie")}
          onSymptome={() => setModaleSOS("symptome")}
          onClose={() => setModaleSOS(null)}
        />
      )}

      {/*
        Le symptôme général — la troisième notion, distincte des deux autres.

        Pas d'`onDouleur` ici, et c'est le point du lot : un mal de tête n'a
        pas de muscle, donc pas de contrainte, pas de substitution et aucun
        effet sur la récupération musculaire. Il ne passe jamais par
        `/api/douleur`.
      */}
      {modaleSOS === "symptome" && (
        <SOSSymptome
          exercicesRestants={restants}
          onClose={() => setModaleSOS(null)}
          onStopSeance={() => router.push(`/sessions/new/${templateId}/finish`)}
          onAlleger={(coupes) => {
            const idParNom = new Map(visibles.map((e) => [e.nom, e.id]));
            skipExercises(coupes.map((n) => idParNom.get(n)).filter((id): id is string => Boolean(id)));
            toast.success("Séance allégée");
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
          /* La cible venait d'un 60 écrit en dur, alors que l'onboarding la
             demande. Sans durée déclarée, on retombe sur le maximum, puis sur
             une heure — mais l'ordre part maintenant de ce que la personne a dit. */
          dureeCibleMin={seance.dureeCibleMinutes ?? seance.dureeMaxMinutes ?? 60}
          exercicesRestants={restants}
          seriesRestantesPar={Object.fromEntries(visibles.map((e) => [
            e.id,
            Math.max(0, e.seriesCibles - (active?.sets ?? []).filter((s) => s.exerciseInstanceId === e.id).length),
          ]))}
          reposSecondesPar={Object.fromEntries(
            visibles.filter((e) => e.reposSecondes != null).map((e) => [e.id, e.reposSecondes!]),
          )}
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
