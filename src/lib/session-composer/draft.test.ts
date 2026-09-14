import { describe, expect, it } from "vitest";
import {
  normalizeDraftExercises,
  saveSessionDraftSchema,
  sessionDraftSchema,
  targetRpe,
  type SessionDraftExercise,
} from "./draft";

const UUIDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];

function exercise(overrides: Partial<SessionDraftExercise> = {}): SessionDraftExercise {
  return {
    clientId: UUIDS[1]!,
    exerciseInstanceId: UUIDS[2]!,
    order: 0,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 3,
    tempo: "3-0-1-0",
    restSeconds: 120,
    ...overrides,
  };
}

function draft(exercises = [exercise()]) {
  return {
    id: UUIDS[0]!,
    origin: "blank" as const,
    name: "Dos express",
    letter: "LIBRE",
    gymId: UUIDS[3]!,
    durationMinutes: 40,
    exercises,
  };
}

describe("brouillon de séance", () => {
  it("refuse une séance vide ou une fourchette inversée", () => {
    expect(sessionDraftSchema.safeParse(draft([])).success).toBe(false);
    expect(sessionDraftSchema.safeParse(draft([exercise({ repMin: 15, repMax: 8 })])).success).toBe(false);
  });

  it("refuse le même appareil deux fois", () => {
    const duplicate = exercise({ clientId: "00000000-0000-4000-8000-000000000099", order: 1 });
    expect(sessionDraftSchema.safeParse(draft([exercise(), duplicate])).success).toBe(false);
  });

  it("normalise l'ordre avant persistance", () => {
    const first = exercise({ clientId: UUIDS[1]!, order: 8 });
    const second = exercise({ clientId: "00000000-0000-4000-8000-000000000099", exerciseInstanceId: "00000000-0000-4000-8000-000000000098", order: 2 });
    expect(normalizeDraftExercises([first, second]).map((item) => [item.clientId, item.order])).toEqual([
      [second.clientId, 0],
      [first.clientId, 1],
    ]);
  });

  it("exige une portée explicite et conserve la convention RIR existante", () => {
    expect(saveSessionDraftSchema.safeParse({ draft: draft() }).success).toBe(false);
    expect(saveSessionDraftSchema.safeParse({ draft: draft(), scope: { type: "today" } }).success).toBe(true);
    expect(targetRpe(null)).toBeNull();
    expect(targetRpe(3)).toBe(7);
    expect(targetRpe(0)).toBe(10);
  });
});
