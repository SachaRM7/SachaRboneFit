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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { ContenuTableauDeBord } = await import("@/components/dashboard/ContenuTableauDeBord");
const { CarteAujourdhui } = await import("@/components/dashboard/CarteAujourdhui");
const { ContenuProgression } = await import("@/components/progression/ContenuProgression");
const { mascotteDeLAccueil } = await import("@/lib/coach/accueil-mascotte");
const { FournisseurCoach } = await import("@/components/coach/ContexteCoach");
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

    await user.click(screen.getByRole("button", { name: "Pourquoi ?" }));
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

// ---------------------------------------------------------------------------
// AUJOURD'HUI — le Coach t'accueille
// ---------------------------------------------------------------------------

/** L'état du jour tel que le moteur le rend, réduit à ce que la carte lit. */
function etatDuJour(etat: Parameters<typeof mascotteDeLAccueil>[0]["etat"]) {
  return {
    etat,
    salle: { id: "s1", nom: "Basic Fit" },
    seance: { templateId: "t1", lettre: "A", nom: "Haut du corps" },
    action: { type: "demarrer_seance", href: "/x", templateId: "t1" },
    enAttenteDeDonnees: false,
  } as never;
}

function rendreAccueil(
  etat: Parameters<typeof mascotteDeLAccueil>[0]["etat"],
  feuJour: "vert" | "orange" | "rouge" | null = "vert",
) {
  useSessionStore.setState({ active: null });
  return render(
    <FournisseurCoach><ContenuTableauDeBord data={{
      user: { nom: "Sacha", poidsActuel: null }, etat: etatDuJour(etat),
      feuJour, feuTendance: null, poids30jours: [],
    }} /></FournisseurCoach>,
  );
}

describe("l'accueil : un Coach, une journée", () => {
  it("séance prête : la mascotte ready est VISIBLE, pas une icône", () => {
    /*
     * Le grief exact du lot précédent était la taille : à 32–40 px, on voyait
     * qu'il y avait quelque chose, pas ce que c'était. La boîte est donc
     * mesurée, pas seulement la présence du bon fichier.
     */
    const { container } = rendreAccueil("prete");
    const img = container.querySelector<HTMLImageElement>(".home-mascot img")!;
    expect(img, "aucune mascotte sur la séance prête").not.toBeNull();
    expect(img.getAttribute("src")).toBe(urlMascotte("ready", "normal"));
    expect(parseInt(img.style.width, 10)).toBeGreaterThanOrEqual(72);
  });

  it("un feu rouge remplace ready par attention", () => {
    // Le corps demande à récupérer : « on y va » contredirait la page.
    const { container } = rendreAccueil("prete", "rouge");
    expect(container.querySelector(".home-mascot img")!.getAttribute("src"))
      .toBe(urlMascotte("attention", "normal"));
  });

  it("un programme en calibration remplace ready par calibration", () => {
    const { container } = rendreAccueil("calibration");
    expect(container.querySelector(".home-mascot img")!.getAttribute("src"))
      .toBe(urlMascotte("calibration", "normal"));
  });

  it("une journée déjà faite montre le débrief", () => {
    const { container } = rendreAccueil("deja_entraine");
    expect(container.querySelector(".home-mascot img")!.getAttribute("src"))
      .toBe(urlMascotte("debrief", "normal"));
  });

  it("une salle à renseigner montre la planification", () => {
    const { container } = rendreAccueil("salle_vide");
    expect(container.querySelector(".home-mascot img")!.getAttribute("src"))
      .toBe(urlMascotte("planification", "normal"));
  });

  it("UNE SEULE mascotte sur la Home, jamais deux", () => {
    for (const e of ["prete", "calibration", "deja_entraine", "salle_vide"] as const) {
      const { container, unmount } = rendreAccueil(e);
      expect(container.querySelectorAll("img.mascotte"), e).toHaveLength(1);
      unmount();
    }
  });

  it("et rien n'est forcé : sans état à dire, aucune image", () => {
    const { container } = render(
      <CarteAujourdhui etat={etatDuJour("prete")} />,
    );
    expect(container.querySelector(".home-mascot")).toBeNull();
    // La carte, elle, reste entière : titre et bouton d'action.
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Commencer ma séance" })).toBeInTheDocument();
  });

  it("la mascotte n'avale ni le titre ni le bouton", () => {
    // Elle précède la carte dans le flux : le titre et le CTA restent lisibles
    // et atteignables, ce qui est toute la condition de sa présence.
    const { container } = rendreAccueil("prete");
    expect(screen.getByRole("heading", { name: "Séance A" }).textContent).toContain("Séance A");
    expect(screen.getByRole("link", { name: "Commencer ma séance" }).textContent).toContain("Commencer ma séance");
    expect(container.querySelector<HTMLElement>(".home-mascot")!.style.pointerEvents)
      .not.toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// PROGRESSION — le Coach lit tes données
// ---------------------------------------------------------------------------

/** Un bilan réduit à ce dont l'écran a besoin pour se rendre. */
function bilan(etat: "sans_donnees" | "premieres_references" | "en_route", enProgression: number) {
  return {
    etat,
    periode: { debut: "2026-01-01", fin: "2026-02-01", jours: 31 },
    seancesTotal: 8,
    seancesDerniereSemaine: 2,
    dureeMedianeMinutes: 52,
    adherence: null,
    volume: null,
    recordsRecents: [],
    /* La forme COMPLÈTE de `ExerciceEnProgression` : `BilanProgression` lit
       `progressionPct` et les deux maximums estimés, et une fixture amputée
       ferait échouer le rendu pour une raison qui n'a rien à voir avec la
       mascotte. Une fixture qui ment coûte plus cher qu'elle ne rapporte —
       la leçon a déjà été payée sur les captures du Live. */
    enProgression: Array.from({ length: enProgression }, (_, i) => ({
      exerciseInstanceId: `i${i}`,
      exerciceNom: `Exercice ${i}`,
      score: 60,
      composantes: {},
      seances: 4,
      ameliorations: 2,
      progressionPct: 7.5,
      e1rmDebut: 80,
      e1rmActuel: 86,
      meilleureSerie: { charge: 70, reps: 8, date: "2026-02-01" },
      premiereSeance: "2026-01-01",
      derniereAmelioration: "2026-02-01",
      joursDepuisAmelioration: 3,
    })),
    musclesDeLaPeriode: [],
    stagnations: [],
    enAttente: [],
  } as never;
}

/* L'écran déclare son contexte au tiroir du Coach : sans le fournisseur, il
   lève avant même de se peindre. On monte donc le vrai arbre. */
const rendreProgression = (b: unknown) =>
  render(
    <FournisseurCoach>
      <ContenuProgression bilan={b as never} />
    </FournisseurCoach>,
  );

const mascotteDe = (c: HTMLElement) =>
  c.querySelector(".progression-mascotte img")!.getAttribute("src");

describe("la progression n'annonce pas de record qu'elle n'a pas", () => {
  it("lecture ordinaire, rien de notable : analyse", () => {
    const { container } = rendreProgression(bilan("en_route", 0));
    expect(mascotteDe(container)).toBe(urlMascotte("analyse", "normal"));
  });

  it("progrès comparable établi par le moteur : progres", () => {
    const { container } = rendreProgression(bilan("en_route", 2));
    expect(mascotteDe(container)).toBe(urlMascotte("progres", "normal"));
  });

  it("PREMIÈRES RÉFÉRENCES : calibration, même avec une liste non vide", () => {
    /*
     * LE CAS QUI COMPTE.
     *
     * Une seule date de séance : tout ce qui a été soulevé est mécaniquement le
     * meilleur résultat jamais enregistré. Afficher `progres` ici serait un faux
     * record — et c'est exactement l'écran où on le croirait.
     */
    const { container } = rendreProgression(bilan("premieres_references", 3));
    expect(mascotteDe(container)).toBe(urlMascotte("calibration", "normal"));
    expect(mascotteDe(container)).not.toBe(urlMascotte("progres", "normal"));
  });

  it("aucune donnée : calibration, jamais un progrès", () => {
    const { container } = rendreProgression(bilan("sans_donnees", 0));
    expect(mascotteDe(container)).toBe(urlMascotte("calibration", "normal"));
  });

  it("une seule mascotte, et le titre reste le sujet", () => {
    const { container } = rendreProgression(bilan("en_route", 1));
    expect(container.querySelectorAll("img.mascotte")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tes progrès.");
  });
});
