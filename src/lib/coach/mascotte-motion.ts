/**
 * Essai web du rossark-motion-skill, limité aux images aplaties existantes.
 * Adaptation de flow() : rossark0/rossark-motion-skill, MIT, commit 9b20964.
 * Voir assets/coach-mascot/MOTION.md et rossark-motion.LICENSE.
 * Aucun choix métier : le consommateur choisit explicitement le mouvement.
 */
export type MouvementMascotte = "ready" | "repos" | "encouragement";
type PoseCle = readonly [number, number];

export const MOUVEMENTS_MASCOTTE = {
  ready: { duree: 3600, respiration: 0.04, origine: "50% 97%", boucle: true },
  repos: { duree: 4000, respiration: 0.06, origine: "50% 92%", boucle: true },
  encouragement: { duree: 1400, respiration: 0.06, origine: "50% 97%", boucle: false },
} as const;

/** Cubique monotone : traverse les poses sans arrêt artificiel ni dépassement. */
function flow(t: number, keys: readonly PoseCle[]): number {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1]![0] < t) i++;
  const slope = (j: number) => (keys[j + 1]![1] - keys[j]![1]) / (keys[j + 1]![0] - keys[j]![0]);
  function tangent(j: number): number {
    if (j === 0 || j === keys.length - 1) return 0;
    const a = slope(j - 1);
    const b = slope(j);
    if (a * b <= 0) return 0;
    const h0 = keys[j]![0] - keys[j - 1]![0];
    const h1 = keys[j + 1]![0] - keys[j]![0];
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  }
  const start = keys[i]!;
  const end = keys[i + 1]!;
  const h = end[0] - start[0];
  const s = (t - start[0]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * start[1]
    + (s3 - 2 * s2 + s) * h * tangent(i)
    + (-2 * s3 + 3 * s2) * end[1]
    + (s3 - s2) * h * tangent(i + 1);
}

const INCLINAISON = {
  ready: [[0, 0], [900, -2.4], [1800, 0], [2700, 2.4], [3600, 0]],
  repos: [[0, 0], [1000, -0.6], [2000, 0], [3000, 0.6], [4000, 0]],
  encouragement: [[0, 0], [240, 1.5], [650, -6], [1000, -2], [1400, 0]],
} as const;

export function poseMascotte(mouvement: MouvementMascotte, temps: number) {
  const spec = MOUVEMENTS_MASCOTTE[mouvement];
  const t = Math.min(spec.duree, Math.max(0, temps));
  const periode = mouvement === "ready" ? spec.duree / 2 : spec.duree;
  const souffle = (1 - Math.cos(t / periode * Math.PI * 2)) / 2;
  const sy = 1 + spec.respiration * souffle;
  return { sx: 1 / sy ** 0.6, sy, angle: flow(t, INCLINAISON[mouvement]) };
}

export function imagesClesMascotte(mouvement: MouvementMascotte): Keyframe[] {
  const spec = MOUVEMENTS_MASCOTTE[mouvement];
  const nombre = Math.ceil(spec.duree / 1000 * 60);
  return Array.from({ length: nombre + 1 }, (_, i) => {
    const { sx, sy, angle } = poseMascotte(mouvement, spec.duree * i / nombre);
    return { offset: i / nombre, transform: `rotate(${angle}deg) scale(${sx}, ${sy})` };
  });
}

/**
 * Une seule horloge WAAPI ; aucun rendu React par image.
 * Le cadre garde sa place. Les images originales restent inchangées.
 * Une pause reprend au même instant ; reduced-motion revient à la pose neutre.
 */
export function animerMascotte(
  image: HTMLImageElement,
  cadre: HTMLElement,
  mouvement: MouvementMascotte,
) {
  const spec = MOUVEMENTS_MASCOTTE[mouvement];
  const origine = image.style.transformOrigin;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let animation: Animation | undefined;
  let visible = typeof IntersectionObserver !== "function";
  let pause = false;
  let reductionForcee = false;
  let detruit = false;
  let termine = false;

  function synchroniser() {
    if (detruit) return;
    const reduit = media.matches || reductionForcee;
    if (reduit) {
      animation?.cancel();
      animation = undefined;
      termine = !spec.boucle;
      cadre.dataset.motion = "reduit";
      return;
    }
    if (termine) {
      cadre.dataset.motion = "termine";
      return;
    }
    const peutJouer = visible && !document.hidden && !pause
      && image.complete && image.naturalWidth > 0;
    if (!peutJouer) {
      animation?.pause();
      cadre.dataset.motion = "pause";
      return;
    }
    // Les navigateurs sans les API nécessaires gardent une image statique.
    if (typeof image.animate !== "function") return;
    if (!animation) {
      image.style.transformOrigin = spec.origine;
      animation = image.animate(imagesClesMascotte(mouvement), {
        duration: spec.duree,
        iterations: spec.boucle ? Infinity : 1,
        fill: "both",
        easing: "linear",
      });
      animation.onfinish = () => {
        termine = true;
        cadre.dataset.motion = "termine";
      };
    } else if (animation.playState === "paused") {
      animation.play();
    }
    cadre.dataset.motion = "actif";
  }

  const observateur = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      synchroniser();
    }, { threshold: 0 }) : null;
  observateur?.observe(cadre);
  // Les anciens WebView Safari ne proposent que addListener/removeListener.
  if (typeof media.addEventListener === "function") media.addEventListener("change", synchroniser);
  else media.addListener(synchroniser);
  document.addEventListener("visibilitychange", synchroniser);
  image.addEventListener("load", synchroniser);
  image.addEventListener("error", synchroniser);
  synchroniser();

  return {
    pause(valeur: boolean) { pause = valeur; synchroniser(); },
    reduire(valeur: boolean) { reductionForcee = valeur; synchroniser(); },
    rejouer() {
      termine = false;
      if (animation) animation.currentTime = 0;
      synchroniser();
    },
    detruire() {
      detruit = true;
      animation?.cancel();
      observateur?.disconnect();
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", synchroniser);
      else media.removeListener(synchroniser);
      document.removeEventListener("visibilitychange", synchroniser);
      image.removeEventListener("load", synchroniser);
      image.removeEventListener("error", synchroniser);
      image.style.transformOrigin = origine;
      delete cadre.dataset.motion;
    },
  };
}
