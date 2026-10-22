/** Geste articulé : une seule horloge, sans rendu React par image. */
export const DUREE_POUCE = 1800;
export const CONTOURS_POUCE = {
  bras: "M175 450H375V520Q419 535 435 589Q460 654 404 720H175Z",
  pouce: "M281 471L281 418Q283 379 315 379Q346 379 353 409L359 471Z",
  eclats: "M120 280H289V450H120Z",
} as const;

function entre(t: number, debut: number, fin: number, a: number, b: number) {
  const x = Math.min(1, Math.max(0, (t - debut) / (fin - debut)));
  return a + (b - a) * x * x * (3 - 2 * x);
}

export function posePouce(t: number) {
  return {
    coude: entre(t, 180, 1220, -95, 0),
    pouce: entre(t, 840, 1430, 145, 0),
    pouceVisible: entre(t, 1000, 1080, 0, 1),
    joint: entre(t, 1050, 1220, 1, 0),
    eclats: entre(t, 1300, 1510, 0, 1),
  };
}

export function animerPouce(svg: SVGSVGElement, source: string, echec: () => void) {
  const partie = (nom: string) => svg.querySelector<SVGElement>(`[data-partie="${nom}"]`)!;
  const coude = partie("coude"), pouce = partie("pouce"), joint = partie("joint");
  const eclats = partie("eclats"), rig = partie("rig"), fixe = partie("fixe");
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  // Le même URL est partagé avec le SVG : une seule ressource réseau en cache.
  const texture = new Image();
  let charge = false, detruit = false, termine = false;
  let visible = typeof IntersectionObserver !== "function";
  let temps = 0, precedent: number | null = null, raf: number | null = null;

  function dessiner(t: number) {
    const pose = posePouce(t);
    coude.setAttribute("transform", `rotate(${pose.coude} 416 612)`);
    pouce.setAttribute("transform", `rotate(${pose.pouce} 322 480)`);
    pouce.setAttribute("opacity", String(pose.pouceVisible));
    joint.setAttribute("opacity", String(pose.joint));
    eclats.setAttribute("opacity", String(pose.eclats));
  }
  function afficherFixe(valeur: boolean) {
    fixe.style.display = valeur ? "" : "none";
    rig.style.display = valeur ? "none" : "";
  }
  function arreter() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    precedent = null;
  }
  function avancer(now: number) {
    raf = null;
    if (precedent !== null) temps = Math.min(DUREE_POUCE, temps + now - precedent);
    precedent = now;
    dessiner(temps);
    if (temps >= DUREE_POUCE) {
      termine = true;
      afficherFixe(true); // Pose finale = texture originale, sans couture résiduelle.
      svg.dataset.motion = "termine";
    } else raf = requestAnimationFrame(avancer);
  }
  function synchroniser() {
    if (detruit) return;
    if (media.matches) {
      arreter();
      termine = true;
      dessiner(DUREE_POUCE);
      afficherFixe(true);
      svg.dataset.motion = "reduit";
    } else if (termine) {
      svg.dataset.motion = "termine";
    } else if (!charge || !visible || document.hidden) {
      arreter();
      svg.dataset.motion = "pause";
    } else if (raf === null) {
      dessiner(temps);
      afficherFixe(false);
      svg.dataset.motion = "actif";
      raf = requestAnimationFrame(avancer);
    }
  }
  const observateur = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      synchroniser();
    }) : null;
  observateur?.observe(svg);
  if (typeof media.addEventListener === "function") media.addEventListener("change", synchroniser);
  else media.addListener(synchroniser);
  document.addEventListener("visibilitychange", synchroniser);
  texture.onload = () => { charge = true; synchroniser(); };
  texture.onerror = () => { if (!detruit) echec(); };
  texture.src = source;
  synchroniser();

  return { detruire() {
    detruit = true;
    arreter();
    observateur?.disconnect();
    if (typeof media.removeEventListener === "function") media.removeEventListener("change", synchroniser);
    else media.removeListener(synchroniser);
    document.removeEventListener("visibilitychange", synchroniser);
    texture.onload = texture.onerror = null;
    afficherFixe(true);
    delete svg.dataset.motion;
  } };
}
