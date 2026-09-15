import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MachineDisponible, SeanceProgramme } from "@/components/programme/GestionProgramme";

/**
 * LES COMMANDES DE L'ÉCRAN PROGRAMME.
 *
 * Ce que ces tests surveillent, et qu'aucun test de fonction pure ne peut voir :
 * ce qui part RÉELLEMENT au serveur quand on touche un champ, un bouton
 * d'ordre ou un bouton d'enregistrement.
 *
 * Deux défauts précis les motivent :
 *
 *   — un champ vidé partait en `Number("")`, donc 0. Zéro série, zéro kilo :
 *     une prescription que personne n'avait formulée. Un champ vide doit être
 *     OMIS, pour que le service reprenne ses valeurs historiques ;
 *   — l'édition se limitait à la cible d'effort, et changer un rang imposait de
 *     retirer la ligne puis de la recréer — en perdant son rang et le lien de
 *     l'historique vers sa ligne d'origine.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { GestionProgramme } = await import("@/components/programme/GestionProgramme");

/**
 * jsdom ne fournit pas la capture de pointeur, que le tiroir (vaul) appelle au
 * premier appui. Sans ce bouchon, ouvrir un tiroir lève une exception qui n'a
 * rien à voir avec ce qu'on vérifie. Il est posé ici, localement, parce que
 * c'est le seul fichier qui ouvre un tiroir.
 */
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

const machines: MachineDisponible[] = [
  { id: "inst-a", machineNom: "Machine A", exerciceNom: "Squat", exerciceSlug: null, salleNom: "Salle 1", pilier: "jambes" },
  { id: "inst-b", machineNom: "Machine B", exerciceNom: "Curl", exerciceSlug: null, salleNom: "Salle 1", pilier: "bras" },
];

function seances(): SeanceProgramme[] {
  return [{
    id: "seance-a",
    lettre: "A",
    nom: "Poussée",
    ordreDansSemaine: 1,
    exercices: [
      {
        ligneId: "ligne-a", ordre: 1, machineNom: "Machine A", exerciceNom: "Squat", exerciceSlug: null,
        seriesCibles: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 10,
        rpeCible: 8, tempo: "3010", reposSecondes: 120, chargeCible: null,
      },
      {
        ligneId: "ligne-b", ordre: 2, machineNom: "Machine B", exerciceNom: "Curl", exerciceSlug: null,
        seriesCibles: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 12,
        rpeCible: null, tempo: null, reposSecondes: null, chargeCible: 20,
      },
    ],
  }];
}

interface Appel {
  url: string;
  methode: string;
  corps: Record<string, unknown> | null;
}

let appels: Appel[] = [];

function rendre() {
  return render(
    <GestionProgramme
      bloc={{ id: "bloc-1", nom: "Cycle force", typeCycle: "force" }}
      seances={seances()}
      machines={machines}
    />,
  );
}

beforeEach(() => {
  appels = [];
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({
      url: String(url),
      methode: init?.method ?? "GET",
      corps: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null,
    });
    return { ok: true, json: async () => ({}) };
  }));
});

describe("réglages d'un exercice programmé", () => {
  it("ajoute un exercice sans kg et sans fabriquer de zéro", async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole("button", { name: /Exercice/ }));
    await user.click(screen.getByRole("button", { name: /^Squat/ }));
    await user.click(screen.getByRole("button", { name: "Ajouter l'exercice" }));

    await waitFor(() => expect(appels).toHaveLength(1));
    const corps = appels[0]!.corps!;
    expect(appels[0]!.url).toBe("/api/programme/seances");
    expect(corps.exerciseInstanceId).toBe("inst-a");
    // Aucun réglage n'est obligatoire. Les nombres structurants sont omis pour
    // que le service les marque comme proposés ; le kg reste `null`, jamais 0.
    expect(corps.chargeCible).toBeNull();
    expect(corps).not.toHaveProperty("seriesCibles");
    expect(corps).not.toHaveProperty("fourchetteRepsMin");
    expect(corps).not.toHaveProperty("fourchetteRepsMax");
  });

  it("laisse un champ vidé ABSENT pour que le service applique ses défauts", async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole("button", { name: /Exercice/ }));
    await user.click(screen.getByRole("button", { name: /^Squat/ }));
    await user.clear(screen.getByLabelText("Séries"));
    await user.clear(screen.getByLabelText("Reps min"));
    await user.clear(screen.getByLabelText("Repos (s)"));
    await user.click(screen.getByRole("button", { name: "Ajouter l'exercice" }));

    await waitFor(() => expect(appels).toHaveLength(1));
    const corps = appels[0]!.corps!;
    // Les colonnes OBLIGATOIRES sont omises, jamais envoyées à 0 : le service
    // écrit alors ses valeurs historiques et les signale « à confirmer ».
    expect(corps).not.toHaveProperty("seriesCibles");
    expect(corps).not.toHaveProperty("fourchetteRepsMin");
    // Les colonnes nullables reçoivent `null` : « rien de prescrit » est une
    // valeur, et c'est ce que dit un champ vidé.
    expect(corps.reposSecondes).toBeNull();
    expect(corps.chargeCible).toBeNull();
  });

  it("refuse une fourchette inversée sans rien envoyer", async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole("button", { name: /Exercice/ }));
    await user.click(screen.getByRole("button", { name: /^Squat/ }));
    await user.clear(screen.getByLabelText("Reps min"));
    await user.type(screen.getByLabelText("Reps min"), "20");
    await user.clear(screen.getByLabelText("Reps max"));
    await user.type(screen.getByLabelText("Reps max"), "10");
    await user.click(screen.getByRole("button", { name: "Ajouter l'exercice" }));

    expect(appels).toHaveLength(0);
  });

  it("édite toute la configuration d'une ligne, kg compris", async () => {
    const user = userEvent.setup();
    rendre();

    // Le second bouton « Modifier » appartient au Curl, deuxième ligne.
    await user.click(screen.getAllByRole("button", { name: "Modifier" })[1]!);

    // Les six réglages sont là, avec les valeurs de la ligne.
    expect(screen.getByLabelText("Séries")).toHaveValue("3");
    expect(screen.getByLabelText("Reps min")).toHaveValue("10");
    expect(screen.getByLabelText("Reps max")).toHaveValue("12");
    expect(screen.getByLabelText("Charge (kg)")).toHaveValue("20");

    await user.clear(screen.getByLabelText("Reps min"));
    await user.type(screen.getByLabelText("Reps min"), "6");
    await user.clear(screen.getByLabelText("Charge (kg)"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]!.url).toBe("/api/programme/exercices/ligne-b");
    expect(appels[0]!.methode).toBe("PATCH");
    const corps = appels[0]!.corps!;
    expect(corps.fourchetteRepsMin).toBe(6);
    expect(corps.fourchetteRepsMax).toBe(12);
    expect(corps.seriesCibles).toBe(3);
    // Le kg vidé se retire : « rien de prescrit » est une valeur, pas un oubli.
    expect(corps.chargeCible).toBeNull();
    // Et l'effort peut revenir à non prescrit.
    expect(corps.rpeCible).toBeNull();
  });
});

describe("ordre des exercices", () => {
  it("remonte le deuxième exercice en une seule écriture de position", async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole("button", { name: "Monter Curl" }));

    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]!.url).toBe("/api/programme/exercices/ligne-b");
    expect(appels[0]!.methode).toBe("PATCH");
    // Une POSITION, pas un échange : 1 = tête de séance.
    expect(appels[0]!.corps).toEqual({ ordre: 1 });
    expect(refresh).toHaveBeenCalled();
  });

  it("n'offre pas de descendre le dernier exercice", () => {
    rendre();
    expect(screen.getByRole("button", { name: "Descendre Curl" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Monter Squat" })).toBeDisabled();
  });
});
