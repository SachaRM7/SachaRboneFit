import { describe, it, expect } from "vitest";
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "./autorisations";

const MOI = "11111111-1111-1111-1111-111111111111";
const AUTRE = "22222222-2222-2222-2222-222222222222";

describe("peutGererLaSalle", () => {
  it("laisse le créateur de la salle la tenir à jour", () => {
    expect(peutGererLaSalle({ userId: MOI }, MOI)).toBe(true);
  });

  it("refuse à un autre compte, même authentifié", () => {
    // Il peut lire le parc et s'entraîner : c'est l'écriture qui est réservée.
    expect(peutGererLaSalle({ userId: AUTRE }, MOI)).toBe(false);
  });

  it("laisse passer une salle sans créateur connu", () => {
    // Il en existe d'anciennes : les verrouiller pour tout le monde
    // n'apporterait rien.
    expect(peutGererLaSalle({ userId: null }, MOI)).toBe(true);
  });

  it("refuse quand la salle n'existe pas", () => {
    expect(peutGererLaSalle(null, MOI)).toBe(false);
    expect(peutGererLaSalle(undefined, MOI)).toBe(false);
  });

  it("porte un refus explicite plutôt qu'un « non »", () => {
    expect(REFUS_GESTION_SALLE).toMatch(/consulter/);
  });
});
