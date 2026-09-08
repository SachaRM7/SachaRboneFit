"use client";
import { useState } from "react";
import { Play, Pause } from "lucide-react";
import { IllustrationExercice } from "./IllustrationExercice";
import {
  ANOMALIES_ILLUSTRATIONS,
  imagesAffichables,
} from "@/lib/referentiels/illustrations";

export function DemonstrationExercice({
  slug,
  nom,
  nbFrames,
}: {
  slug: string;
  nom: string;
  nbFrames: number;
}) {
  const [anime, setAnime] = useState(false);
  const [image, setImage] = useState<number | undefined>();
  const images = imagesAffichables(slug, nbFrames);
  const source = ANOMALIES_ILLUSTRATIONS[slug]?.demonstration;
  if (!images.length)
    return (
      <section className="movement-demo">
        <h2>Observer le mouvement</h2>
        <p>Consulte une démonstration de ce mouvement chez notre source.</p>
        {source && (
          <a
            className="movement-back"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            <Play size={18} aria-hidden /> Voir la démonstration · {source.nom}{" "}
            (en anglais)
          </a>
        )}
      </section>
    );
  return (
    <section className="movement-demo" aria-label="Illustration du mouvement">
      <div className="movement-demo-heading">
        <span className="eyebrow">Observer le mouvement</span>
        <span>{images.length} positions</span>
      </div>
      <IllustrationExercice
        slug={slug}
        nom={nom}
        nbFrames={nbFrames}
        anime={anime}
        imageFixe={anime ? undefined : image}
        className="movement-illustration"
      />
      <div className="movement-controls">
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setImage(undefined);
              setAnime(!anime);
            }}
            aria-pressed={anime}
          >
            {anime ? (
              <Pause size={18} aria-hidden />
            ) : (
              <Play size={18} aria-hidden />
            )}
            {anime ? "Pause" : "Animer"}
          </button>
        )}
        <div aria-label="Positions du mouvement">
          {images.map((frame, index) => (
            <button
              key={frame}
              type="button"
              aria-label={`Voir la position ${index + 1}`}
              aria-pressed={!anime && image === frame}
              onClick={() => {
                setAnime(false);
                setImage(frame);
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
      <p className="movement-attribution">
        Illustrations : workout-guide / Everkinetic ·{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 4.0
        </a>
      </p>
    </section>
  );
}
