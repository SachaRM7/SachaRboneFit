import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DraftSet = {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
  rpeEffectif: number | null;
  notes?: string;
  validatedAt?: number;
  reposReelSecondes?: number | null;
};

export type ActiveSession = {
  id: string;
  seanceTemplateId: string;
  gymId: string;
  startedAt: number;
  sets: DraftSet[];
  currentExerciseIndex: number;
  notesSeance: string;
  // Rest timer state
  restStartTimestamp: number | null;
  restDurationSeconds: number | null;
  restExerciseIndex: number | null;
  // Completion tracking
  completedAt: number | null;
};

type SessionStore = {
  active: ActiveSession | null;
  start: (s: Omit<ActiveSession, "id" | "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance" | "restStartTimestamp" | "restDurationSeconds" | "restExerciseIndex" | "completedAt">) => void;
  upsertSet: (set: DraftSet) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setNotes: (notes: string) => void;
  // Rest timer actions
  startRest: (durationSeconds: number, exerciseIndex: number) => void;
  clearRest: () => void;
  extendRest: (extraSeconds: number) => void;
  // Session completion
  complete: () => void;
  clear: () => void;
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      active: null,
      start: (data) => set({
        active: {
          ...data,
          id: crypto.randomUUID(),
          startedAt: Date.now(),
          sets: [],
          currentExerciseIndex: 0,
          notesSeance: "",
          restStartTimestamp: null,
          restDurationSeconds: null,
          restExerciseIndex: null,
          completedAt: null,
        },
      }),
      upsertSet: (newSet) => set((state) => {
        if (!state.active) return state;
        const existing = state.active.sets.findIndex(
          s => s.exerciseInstanceId === newSet.exerciseInstanceId && s.numeroSerie === newSet.numeroSerie
        );
        const sets = [...state.active.sets];
        if (existing >= 0) sets[existing] = newSet;
        else sets.push(newSet);
        return { active: { ...state.active, sets } };
      }),
      setCurrentExerciseIndex: (i) => set((state) =>
        state.active ? { active: { ...state.active, currentExerciseIndex: i } } : state
      ),
      setNotes: (notes) => set((state) =>
        state.active ? { active: { ...state.active, notesSeance: notes } } : state
      ),
      startRest: (durationSeconds, exerciseIndex) => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            restStartTimestamp: Date.now(),
            restDurationSeconds: durationSeconds,
            restExerciseIndex: exerciseIndex,
          }
        } : state
      ),
      clearRest: () => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            restStartTimestamp: null,
            restDurationSeconds: null,
            restExerciseIndex: null,
          }
        } : state
      ),
      extendRest: (extraSeconds) => set((state) => {
        if (!state.active?.restStartTimestamp || !state.active?.restDurationSeconds) return state;
        return {
          active: {
            ...state.active,
            restDurationSeconds: state.active.restDurationSeconds + extraSeconds,
          }
        };
      }),
      complete: () => set((state) =>
        state.active ? { active: { ...state.active, completedAt: Date.now() } } : state
      ),
      clear: () => set({ active: null }),
    }),
    { name: "active-session" }
  )
);
