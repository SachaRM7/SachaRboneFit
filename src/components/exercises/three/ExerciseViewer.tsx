"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Rotate3D } from "lucide-react";
import { MOVEMENTS_3D } from "@/lib/exercises-3d/catalogue";
import type { MovementId } from "@/lib/exercises-3d/rig";
import styles from "./viewer.module.css";

export interface ViewerController {
  play(value: boolean): void;
  speed(value: number): void;
  seek(value: number): void;
  view(value: "front" | "side" | "back"): void;
  dispose(): void;
}

export function ExerciseViewer({ movement }: { movement: MovementId }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ViewerController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState(0);
  const item = MOVEMENTS_3D[movement];

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    let active: ViewerController | null = null;
    const element = host.current;
    if (!element) return;
    import("./scene")
      .then(({ createExerciseScene }) =>
        createExerciseScene(element, movement, setPhase, abort.signal),
      )
      .then((scene) => {
        if (cancelled) {
          scene.dispose();
          return;
        }
        active = scene;
        controller.current = scene;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      abort.abort();
      active?.dispose();
      controller.current = null;
    };
  }, [movement]);

  return (
    <section
      className={styles.viewer}
      aria-label={`Démonstration 3D : ${item.name}`}
    >
      <div className={styles.stage}>
        <div
          ref={host}
          className={styles.canvas}
          aria-label="Modèle anatomique. Utilise les boutons pour changer l’angle de vue."
        />
        <span className={styles.badge}>ANATOMIE EN MOUVEMENT</span>
        {status === "loading" && (
          <div className={styles.overlay} role="status">
            Préparation du modèle 3D…
          </div>
        )}
        {status === "error" && (
          <div className={styles.overlay} role="alert">
            La 3D n’est pas disponible sur cet appareil ou n’a pas pu être
            chargée. Les consignes de l’exercice restent accessibles.
          </div>
        )}
        <div className={styles.legend}>
          <span /> {item.muscles.join(" · ")}
        </div>
        <p className={styles.gesture}>
          <Rotate3D size={15} aria-hidden /> Glisse pour tourner · pince pour
          zoomer
        </p>
      </div>
      <div className={styles.controls}>
        <div className={styles.toolbar}>
          <button
            className={styles.play}
            disabled={status !== "ready"}
            onClick={() => {
              controller.current?.play(!playing);
              setPlaying(!playing);
            }}
            aria-label={playing ? "Mettre en pause" : "Lire le mouvement"}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}{" "}
            {playing ? "Pause" : "Lire"}
          </button>
          <label className={styles.speed}>
            Vitesse{" "}
            <select
              value={speed}
              disabled={status !== "ready"}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSpeed(value);
                controller.current?.speed(value);
              }}
            >
              <option value={0.25}>¼×</option>
              <option value={0.5}>½×</option>
              <option value={1}>1×</option>
            </select>
          </label>
          <button
            className={styles.reset}
            aria-label="Revenir au début"
            disabled={status !== "ready"}
            onClick={() => {
              controller.current?.seek(0);
              controller.current?.play(false);
              setPlaying(false);
              setPhase(0);
            }}
          >
            <RotateCcw size={19} />
          </button>
        </div>
        <label className={styles.timeline}>
          Décomposer le mouvement <span>{Math.round(phase * 100)} %</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={phase}
            disabled={status !== "ready"}
            onChange={(e) => {
              const value = Number(e.target.value);
              controller.current?.play(false);
              controller.current?.seek(value);
              setPlaying(false);
              setPhase(value);
            }}
          />
        </label>
        <div className={styles.angles} aria-label="Angle de vue">
          {(
            [
              ["front", "Face"],
              ["side", "Profil"],
              ["back", "Dos"],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              disabled={status !== "ready"}
              onClick={() => controller.current?.view(view)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={styles.cue}>{item.cue}</p>
        <p className={styles.note}>
          Prototype : mouvement simplifié, à valider. Le rouge indique les
          muscles ciblés, pas une mesure de leur activité.
        </p>
        <a
          className={styles.credit}
          href="/models/exercises-3d/ATTRIBUTION.txt"
          target="_blank"
          rel="noreferrer"
        >
          Modèle BodyParts3D · sources et licence ↗
        </a>
      </div>
    </section>
  );
}

export function Exercise3DPreview({ movement }: { movement: MovementId }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <ExerciseViewer key={movement} movement={movement} />
  ) : (
    <button className={styles.launch} onClick={() => setOpen(true)}>
      <Rotate3D size={26} aria-hidden />
      <span>
        <strong>Explorer le mouvement en 3D</strong>
        <small>Tourne autour du corps et observe les muscles ciblés.</small>
      </span>
      <span aria-hidden>↗</span>
    </button>
  );
}

export function Exercise3DStudio() {
  const [movement, setMovement] = useState<MovementId>("squat");
  return (
    <div>
      <div className={styles.choices} aria-label="Choisir un mouvement">
        {(Object.keys(MOVEMENTS_3D) as MovementId[]).map((id, i) => (
          <button
            key={id}
            aria-pressed={movement === id}
            onClick={() => setMovement(id)}
          >
            <small>0{i + 1}</small>
            <strong>{MOVEMENTS_3D[id].name}</strong>
            <span>{MOVEMENTS_3D[id].equipment}</span>
          </button>
        ))}
      </div>
      <ExerciseViewer key={movement} movement={movement} />
    </div>
  );
}
