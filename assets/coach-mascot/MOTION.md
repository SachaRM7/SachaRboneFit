# MOTION.md: living illustrations in this project

> Copy this file next to the project's art (for example `src/art/MOTION.md`) and fill in **Part 2** as you learn the project. Part 1 is the method and stays as it is. The `rossark-motion-skill` reads this file first, and Part 2 overrides the skill's defaults.

---

## Part 1. The method

**The goal:** anything drawn (a character, a plant, a flame, a street, a logo, a chart) feels alive and calm. Nothing teleports, nothing bounces, nothing shouts.

### Principles
1. **Never teleport:** interpolate everything; never swap drawings.
2. **Calm by default:** strong curves, no bouncy overshoot.
3. **Small amplitudes:** when unsure, halve it.
4. **Arcs and pivots:** each moving part is a layer rotating around its joint (stem base, hinge, neck, hook).
5. **Overlap and follow-through:** tips and trailing parts move later and further; give each part the same wave with a growing phase delay.
6. **Variety without chaos:**
   - repeated items get a seeded phase, speed and size;
   - nothing moves in sync, and there's no random value per frame.
7. **One main action per scene, plus two or three idle loops.** Side things stay quiet.
8. **Opacity only to appear or disappear.**
9. **The layout never moves:** motion lives inside the drawing.
10. **Reduced motion:** loops freeze on a good frame 0, and one-shots show their final frame.
11. **Nothing runs unseen:** pause off screen, when hidden and in the background.
12. **Enough frames:** anything under ~100 ms flickers at 30 fps; render and export at 60 when you can. Blinks close in ~110 ms and reopen in ~190 ms.
13. **Interface rules:**
    - frequency decides how much (often seen = barely moves; rare moments get the delight);
    - every motion has a purpose;
    - shared elements travel, never teleport;
    - interface moves stay under 300 ms;
    - exits are faster than entrances;
    - nothing appears from scale 0;
    - interruptions continue from the current value.

### The engine
- **Clocks:** a loop clock for idle life, a one-shot clock for a scene that tells an action. One per character, group or scene.
- **Tracks:** keyframes `[ms, value, 'out'?]` read with `track(t, keys)`. The last key equals the first. `track` stops at every key, so use it for one move (a blink, a lid). For acting (a chain of poses), use `flow(t, keys)`, which passes through the keys without stopping and never overshoots.
- **Helpers:**
  - `wave` (−1 to 1), for sway and breathing;
  - `loop` (0 to 1), for drift and falling;
  - `bell`, to fade in and out;
  - `seg`, for one beat of a one-shot;
  - `seeded(i)`, for per-item variety.
- **Curves:**
  - travel uses ease-in-out `(0.77, 0, 0.175, 1)`;
  - open and arrive use ease-out `(0.23, 1, 0.32, 1)`;
  - leaving uses ease-in;
  - endless loops are linear.

### Quick recipes
| Subject | Recipe |
|---|---|
| Character | breathing 1–2 units over 3–5 s; a blink every 3–4 s; pupils glide; head tilt 3–6° |
| Waiting to be tapped | a jiggle every ~270 ms: squash 2%, widen 2%, the bulge trading sides |
| Floating figure | rises in from 30% of its height below, drifts 5% down and up, leaves rising |
| Tail, hair, ears | rotation around the root, phase delayed along the chain, 4–10° |
| Plant | sway 1.5–4° around the base over 3–6 s; leaves on seeded phases |
| Cloth, flag | a wave that travels along the length, growing away from the fixed edge |
| Fire | a lean of 2–4° and a 3–6% stretch on two waves of different periods |
| Smoke, steam | rises 8–14 units and fades in and out with `bell` |
| Water | ripples grow and fade; floating things bob 1–2 units and rock 2° |
| Rain, snow | seeded `loop`s; snow sways sideways |
| Sky | clouds drift over 20–60 s with parallax; sun rays take 30–60 s per turn |
| Lights | a glow of 2–5% over 2–4 s; stars twinkle at seeded times |
| Machines | gears turn linearly by ratio; a clock hand steps with ease-out |
| Phone | ±3° bursts, then a pause |
| Icon, logo | plays once on appear, then rests |
| Chart | a one-shot draw-on, with bars staggered 40–80 ms |

### Acting (a whole character)
- **Every channel:** key pose (`flow`) + idle (`wave`s, never off while on stage) + follow-through (the parent read 90–140 ms earlier) + accents (a `wave` inside a `seg` window).
- **Arms:** an upper arm and a forearm share a round elbow; the forearm points at shoulder angle + elbow bend.
- **Head turns:** slide the face toward the turn (eyes 10, nose 13 in a 100-wide head) and the ears the other way. Blink on the turn.
- **Weight:** the hips shift and carry the upper body, and the legs angle to keep the feet under it.
- **Landing:** hover, then fall with gravity and stretch; squash hard (0.8) on contact and keep the volume (`width = 1 / height^0.6`).
- **In the air:** limp feet (toes down, one knee folded, trading slowly). The shadow stays on the floor and scales with the height.
- **Props:** enter from off screen already moving and roll by distance / radius. The eyes follow them. A kick hits at the middle of the swing; the prop leaves as a throw, spinning, with a short squash.
- **Asymmetry:** the arms never mirror each other.
- **Camera:** a view from a little above is a whole build, not a tweak: the head is 40–50% of the height, the torso is short and narrower than the head, the legs are short, the feet are round from above, and the shadow is a wide oval with the feet in its lower half. Keep it in one `build` object. A flat view keeps a thin pill shadow.
- **Framing:** on a phone, as big as the screen allows, with the feet low.

### From a reference video
- Contact sheets at the full frame rate (`tools/sheet.sh`).
- Measure motion with numbers (`tools/track_edges.py`): a 2% jiggle or a 5% float doesn't show to the eye.
- Sample colors from pixels (`tools/sample_colors.py`).
- Go part by part: feet, shadow, hands, head.
- Compare proportions as ratios of one unit (head widths). "Stretched" means a ratio is far off.
- Compare your render with the reference at the same moments.
- Don't publish a copy of someone else's art.

### Performance
- Everything is a function of one clock's time.
- Draw many items in one SVG or `Canvas`.
- Reset repeating animations to 0 before starting, and cancel them on cleanup.
- Declare curves at the top of the module.

### Workflow
1. Read Part 2 and the art file's header comments.
2. List what could live in the drawing.
3. Pick one main action and two or three idle loops.
4. Split the art into layers at their pivots.
5. Put the numbers in tokens.
6. Check frame 0, the final frames and the loop seams. For a character, look at a contact sheet of every 4th frame of your own render.
7. Run the checks.
8. Hand off: what moves, and what hasn't been seen on a real device.

---

## Part 2. This project

Essai du 22 octobre 2026, activé dans l'application à la demande du propriétaire.
Source : https://github.com/rossark0/rossark-motion-skill, commit
`9b20964e32f07f8ac7e2948cd175746fa4a7712f` (MIT ; licence jointe).

### Where the code is
- **Platform:** Next.js 16 / React 19, web.
- **Motion engine:** `src/lib/coach/mascotte-motion.ts`, adaptation de `flow`
  et de la respiration périodique. Une animation Web Animations API par image,
  interpolée par le navigateur, sans rendu React par frame. Aucun paquet ajouté.
- **Composant:** `src/components/coach/MascotteCoach.tsx` active les trois
  mouvements dès 40 px, y compris repos/encouragement dans le Live.
  Les autres dessins (hors beast) utilisent la respiration neutre de ready.
  `vivante={false}` permet de désactiver explicitement le mouvement.
- **Comparatif en ligne:** `/mascotte` rend les mêmes composants que l'app,
  sans données utilisateur. Le prototype HTML autonome reste reproductible.
- **Art:** treize PNG aplatis dans `assets/coach-mascot/masters`, dérivés WebP
  dans `public/coach-mascot/w`. Trois mouvements : veille (ready), repos, encouragement.
- **Aperçu:** `npx tsx src/scripts/apercu-mascotte-motion.mts` produit
  `apercus/mascotte-motion.html`, autonome, avec les vrais WebP et le même moteur.
  Ouvrir dans un navigateur. Choix de situation, taille, pause et mouvement réduit.

### The owner's rules
- Demande du 22/10/2026 : « Test https://github.com/rossark0/rossark-motion-skill
  pour ma mascotte sur SachaRbone Fit ».
- Suite du 22/10/2026 : « Alors déploie prod ». Activation des trois mouvements
  testés et publication via main, en conservant les résolveurs d'états existants.
- Les commentaires de `MascotteCoach` et du registre font foi : aucun choix
  métier dans le rendu, aucune information uniquement portée par l'image,
  dimensions réservées et repli conservés. Ne pas activer beast.

### Rig limits
- Ready/veille : respiration 4 %, inclinaison ±2,4°, boucle 3,6 s.
  Repos : respiration 6 %, inclinaison ±0,6°, boucle 4 s.
- Encouragement : geste articulé de 1,8 s dans `MascottePouce`, intégré à
  `MascotteCoach`, donc également à l'en-tête Live en 40 px. Le corps, le visage
  et les pieds restent fixes. Le coude passe de −95° à 0°, puis le pouce de
  145° à 0°. Le pouce émerge derrière les doigts ; des raccords arrondis
  maintiennent la continuité au coude et à la main.
- Le geste utilise la texture WebP existante, composée dans un SVG avec
  groupes, clips et masques. Aucun master, dérivé ou appel de génération
  n'est ajouté. Les proportions sont conservées (`xMidYMid meet`). Il s'agit
  d'une articulation 2D issue d'une seule projection, pas d'un modèle 3D.
- Une seule horloge requestAnimationFrame, aucune mise à jour React par image.
  Départ après chargement et entrée dans le champ ; pause hors écran et onglet
  masqué ; nettoyage au démontage. Pas de boucle du geste.
- Le rendu serveur, la fin du geste et la réduction de mouvement affichent
  directement la texture originale. Les dimensions sont réservées et le repli
  en cas d'image manquante conserve exactement la même boîte.
- Le comparatif public `/mascotte` commence sur « Bien joué » et permet de
  rejouer le vrai composant, de choisir 40/72/120 px et de le désactiver.

### How changes are checked
- Types : `npx tsc --noEmit` ; lint ciblé.
- Fonctions : `npx vitest run src/lib/coach/mascotte-motion.test.ts
  src/lib/coach/mascotte-assets.test.ts src/lib/coach/resoudre-mascotte.test.ts`.
- Composants : `npm run test:composants -- src/tests/mascotte-coach.ctest.tsx
  src/tests/mascotte-motion.ctest.tsx`. Vérifie notamment le vrai en-tête Live,
  le rendu articulé et la destruction de son moteur à la désactivation.
- Navigateur : `node src/scripts/verifier-mascotte-app.mjs URL`.
  `MOTION_BROWSER=webkit` pour WebKit. Bras et pouce indépendants aux trois
  tailles, corps fixe, pose finale originale, reprise après pause hors écran
  et signal d'onglet masqué, mouvement réduit, repli sur erreur de chargement,
  contrôles, absence d'erreur JS et de débordement à 320/390/1280 px.
- Inspection visuelle des poses intermédiaires du composant réel, agrandi et
  aux tailles d'usage. Chromium et WebKit automatisés ; pas de téléphone
  physique ni de session authentifiée de l'utilisateur dans cet environnement.

### Clarification du geste attendu — 22/10/2026

Le propriétaire attend des gestes articulés : relever l'avant-bras et déplier
le pouce. Le balancement de l'image entière ne répondait pas à cette demande.
Après le premier prototype local, demande explicite : « Ok affine puis
 déploie ». L'encouragement utilise désormais le geste articulé décrit ici.
