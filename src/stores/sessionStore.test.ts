import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "./sessionStore";

/**
 * Deux comportements de la séance en cours, et deux défauts qu'ils corrigent.
 *
 * MASQUER N'EST PAS CESSER DE MESURER. `clearRest` effaçait l'instant de départ
 * du repos en même temps que la durée affichée : fermer le compte à rebours
 * détruisait donc la mesure, et la série suivante enregistrait `null` alors que
 * le repos avait bien eu lieu. Seule la durée cible s'efface désormais — c'est
 * elle qui pilote l'affichage.
 *
 * LE TEMPO SE SIGNALE AU NIVEAU DE L'EXERCICE, et il est rangé à part plutôt
 * qu'écrit sur les séries. Muter les séries déjà saisies laisserait sans valeur
 * celles validées APRÈS le signalement : l'ordre des gestes déciderait du
 * résultat. La carte est appliquée à la clôture, donc l'ordre n'a plus d'effet.
 */

const demarrer = () =>
  useSessionStore.getState().start({ id: "s1", seanceTemplateId: "t1", gymId: "g1" });

beforeEach(() => {
  useSessionStore.setState({ active: null });
  demarrer();
});

describe("fermer le minuteur ne détruit pas la mesure", () => {
  it("la durée affichée s'efface, l'instant de départ survit", () => {
    const { startRest, clearRest } = useSessionStore.getState();
    startRest(120, 0);
    const depart = useSessionStore.getState().active!.restStartTimestamp;
    expect(depart).not.toBeNull();

    clearRest();
    const apres = useSessionStore.getState().active!;
    expect(apres.restDurationSeconds).toBeNull();
    expect(apres.restStartTimestamp).toBe(depart);
  });

  it("un nouveau départ remplace bien le précédent", () => {
    const { startRest } = useSessionStore.getState();
    startRest(120, 0);
    const premier = useSessionStore.getState().active!.restStartTimestamp!;
    startRest(90, 1);
    const second = useSessionStore.getState().active!;
    expect(second.restStartTimestamp).toBeGreaterThanOrEqual(premier);
    expect(second.restDurationSeconds).toBe(90);
    expect(second.restExerciseIndex).toBe(1);
  });
});

describe("le signalement de tempo porte sur l'exercice", () => {
  it("rien n'est signalé par défaut", () => {
    expect(useSessionStore.getState().active!.tempoParExercice).toEqual({});
  });

  it("signaler un non-respect n'affecte que cet exercice", () => {
    useSessionStore.getState().signalerTempo("exo-A", false);
    const carte = useSessionStore.getState().active!.tempoParExercice;
    expect(carte["exo-A"]).toBe(false);
    expect(carte["exo-B"]).toBeUndefined();
  });

  it("le signalement vaut aussi pour les séries validées APRÈS lui", () => {
    // C'est tout l'intérêt de la carte : elle ne dépend pas de l'ordre des
    // gestes. Une série ajoutée ensuite reçoit la même valeur à la clôture.
    const { signalerTempo, upsertSet } = useSessionStore.getState();
    signalerTempo("exo-A", false);
    upsertSet({ exerciseInstanceId: "exo-A", numeroSerie: 1, repsEffectuees: 8, charge: 80, rpeEffectif: 8 });

    const etat = useSessionStore.getState().active!;
    const valeur = etat.tempoParExercice["exo-A"] ?? null;
    expect(valeur).toBe(false);
    expect(etat.sets).toHaveLength(1);
  });

  it("annuler un signalement le retire, sans le remplacer par « respecté »", () => {
    const { signalerTempo } = useSessionStore.getState();
    signalerTempo("exo-A", false);
    signalerTempo("exo-A", null);
    const carte = useSessionStore.getState().active!.tempoParExercice;
    expect(carte["exo-A"]).toBeUndefined();
    expect(carte["exo-A"] ?? null).toBeNull();
  });

  it("aucune valeur `true` n'est jamais produite par le signalement", () => {
    const { signalerTempo } = useSessionStore.getState();
    signalerTempo("exo-A", false);
    signalerTempo("exo-B", null);
    const carte = useSessionStore.getState().active!.tempoParExercice;
    expect(Object.values(carte)).not.toContain(true);
  });
});
