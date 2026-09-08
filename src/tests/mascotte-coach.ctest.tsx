import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * LA MASCOTTE EST UNE REPRÉSENTATION, PAS UNE DÉCISION.
 *
 * Ces tests rendent les vrais composants pour vérifier trois choses qu'aucun
 * test de fonction pure ne peut établir :
 *
 *   — le bon asset arrive réellement à l'écran ;
 *   — un fichier manquant ne casse rien et ne déplace rien ;
 *   — « En parler au coach » n'appelle AUCUN modèle avant que l'utilisateur
 *     ne le touche.
 *
 * Le dernier point est le plus important du lot. Un appel automatique
 * déclenché par un événement de séance consommerait le quota sans que personne
 * ne l'ait demandé, et ferait parler le Coach à un moment que l'athlète n'a pas
 * choisi.
 */

/** Le réseau est surveillé : rien ne doit partir tout seul. */
const fetchEspion = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
);
vi.stubGlobal("fetch", fetchEspion);

vi.mock("@/components/session/serie-en-vol", () => ({
  pousserSerie: () => {},
  retirerSerieEnVol: () => {},
  revisionSuivante: () => Date.now(),
}));

const { MascotteCoach } = await import("@/components/coach/MascotteCoach");
const { ObservateurSeance } = await import("@/components/session/ObservateurSeance");
const { useSessionStore } = await import("@/stores/sessionStore");
const { ASSETS_MASCOTTE, urlMascotte } = await import("@/lib/coach/mascotte-assets");

const A = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  fetchEspion.mockClear();
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "seance-1",
    seanceTemplateId: "modele",
    gymId: "salle",
  });
});

describe("le composant affiche l'asset demandé", () => {
  it("pointe vers le dérivé web, jamais vers le master", () => {
    const { container } = render(<MascotteCoach etat="training" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(urlMascotte("training", "normal"));
    expect(img.getAttribute("src")).not.toMatch(/\.png$/);
  });

  it("réserve sa place avant le chargement", () => {
    // Sans dimensions, l'image pousse la mise en page à son arrivée.
    const { container } = render(<MascotteCoach etat="repos" presence="forte" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("width")).toBeTruthy();
    expect(img.getAttribute("height")).toBeTruthy();
    expect(img.style.width).toBe("120px");
  });

  it("se charge à la demande — le Live ne paie pas treize images au démarrage", () => {
    const { container } = render(<MascotteCoach etat="analyse" />);
    expect(container.querySelector("img")!.getAttribute("loading")).toBe("lazy");
  });

  it("reste muet quand il n'ajoute rien au texte voisin", () => {
    // `training` illustre un fait déjà écrit : un lecteur d'écran qui annonce
    // « Coach en train de s'entraîner » à chaque série n'aide personne.
    const { container } = render(<MascotteCoach etat="training" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("mais parle quand il porte une nuance", () => {
    render(<MascotteCoach etat="attention" />);
    expect(screen.getByAltText(ASSETS_MASCOTTE.attention.alt)).toBeInTheDocument();
  });
});

describe("un asset manquant ne casse jamais un écran", () => {
  it("le repli garde EXACTEMENT la même boîte", () => {
    /*
     * Une image absente qui laisse un trou déplace tout ce qui l'entoure —
     * c'est pire que l'image manquante elle-même, parce que le défaut se
     * répercute sur des éléments qui, eux, fonctionnent.
     */
    const { container } = render(<MascotteCoach etat="beast" presence="normale" />);
    const img = container.querySelector("img")!;
    expect(img.style.width).toBe("72px");

    // On force l'échec de chargement, comme le ferait un fichier absent.
    fireEvent.error(img);

    const repli = container.querySelector<HTMLElement>(".mascotte-repli");
    expect(repli, "aucun repli : l'écran garderait une image cassée").not.toBeNull();
    expect(repli!.style.width).toBe("72px");
    expect(repli!.style.height).toBe("72px");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("l'observateur de séance mène au Coach — et seulement sur un geste", () => {
  const prescriptions = [
    {
      exerciseInstanceId: A,
      seriesCibles: 3,
      fourchetteRepsMin: 8,
      fourchetteRepsMax: 12,
      rpeCible: 8,
      reposSecondes: 120,
    },
  ];

  /** Une série nettement plus dure que la cible : un fait, pas une opinion. */
  function serieTropDure() {
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A,
      numeroSerie: 1,
      charge: 60,
      repsEffectuees: 8,
      // La cible est 8 ; 10 est au-delà, et `evenements-seance` le retient
      // dès la première occurrence.
      rpeEffectif: 10,
    });
  }

  it("affiche le constat, sa mascotte, et le fait en toutes lettres", () => {
    serieTropDure();
    const { container } = render(
      <ObservateurSeance
        prescriptions={prescriptions}
        ordreDesExercices={[A]}
        onDemanderCoach={() => {}}
      />,
    );

    const img = container.querySelector("img");
    expect(img?.getAttribute("src"), "pas la mascotte d'intervention")
      .toBe(urlMascotte("intervention", "compact"));

    // Le fait reste lisible sans l'image : la mascotte n'est jamais la seule
    // à porter l'information.
    expect(screen.getByText(/plus dure que visé/i)).toBeInTheDocument();
  });

  it("N'APPELLE AUCUN MODÈLE tant que personne n'a touché le bouton", () => {
    serieTropDure();
    render(
      <ObservateurSeance
        prescriptions={prescriptions}
        ordreDesExercices={[A]}
        onDemanderCoach={() => {}}
      />,
    );
    // Le cœur de la règle : un événement déterministe ne déclenche jamais un
    // appel. Le quota appartient à l'utilisateur, pas à l'écran.
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it("le clic transmet une DÉSIGNATION, pas des données", async () => {
    const user = userEvent.setup();
    const demande = vi.fn();
    serieTropDure();
    render(
      <ObservateurSeance
        prescriptions={prescriptions}
        ordreDesExercices={[A]}
        onDemanderCoach={demande}
      />,
    );

    await user.click(screen.getByRole("button", { name: /En parler au coach/i }));

    expect(demande).toHaveBeenCalledOnce();
    const [evenement] = demande.mock.calls[0]!;
    // Un type, un identifiant d'exercice. Aucun identifiant d'utilisateur,
    // aucune donnée métier : le serveur relit la séance lui-même.
    expect(evenement.type).toBe("effort_au_dela_de_la_cible");
    expect(evenement.exerciseInstanceId).toBe(A);
    expect(JSON.stringify(evenement)).not.toMatch(/user/i);
    // Et toujours aucun appel réseau : c'est le tiroir qui décidera.
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it("un constat écarté ne revient pas dans la séance", async () => {
    const user = userEvent.setup();
    serieTropDure();
    const { container } = render(
      <ObservateurSeance prescriptions={prescriptions} ordreDesExercices={[A]} />,
    );
    expect(container.querySelector(".coach-constat")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Masquer ce constat/i }));

    // La politique anti-spam existante est conservée telle quelle : aucun
    // second système de temporisation n'a été ajouté.
    expect(container.querySelector(".coach-constat")).toBeNull();
  });

  it("un seul constat visible à la fois", () => {
    serieTropDure();
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 2, charge: 60, repsEffectuees: 4, rpeEffectif: 10,
    });
    const { container } = render(
      <ObservateurSeance prescriptions={prescriptions} ordreDesExercices={[A]} />,
    );
    expect(container.querySelectorAll(".coach-constat")).toHaveLength(1);
  });
});
