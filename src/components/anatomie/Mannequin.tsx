"use client";
import { useId, useMemo, useState } from "react";
import {
  FACES, LIBELLES_FACE, REGIONS_PAR_ID, VUE,
  regionsDeLaFace, sollicitationDesRegions,
  type Face, type Forme, type RegionAnatomique, type Sollicitation,
} from "@/lib/referentiels/anatomie";
import type { Muscle } from "@/lib/referentiels/muscles";

/**
 * Un seul corps dessiné, deux usages.
 *
 * Il en existait zéro. Deux promesses en dépendaient — désigner sa douleur
 * autrement qu'en lisant dix-sept pastilles, et voir ce qu'un exercice
 * travaille — et chacune aurait produit sa propre planche si on les avait
 * traitées séparément. Deux dessins finissent toujours par diverger : l'un
 * apprend qu'un tirage sollicite l'arrière d'épaule, l'autre non.
 *
 * D'où un composant, deux modes, et la géométrie déclarée UNE fois dans
 * `lib/referentiels/anatomie` — pas ici. Ce fichier ne sait que peindre et
 * écouter le pouce ; il ne décide ni de ce qu'est une zone, ni de quel muscle
 * elle implique.
 *
 * CE QUE LE DESSIN NE PRÉTEND PAS ÊTRE
 *
 * Des rectangles arrondis et des ellipses, pas une planche anatomique. Le
 * moteur connaît quinze muscles et dix-sept zones ; une illustration médicale
 * montrerait des faisceaux que l'application est incapable de distinguer, et
 * ferait croire à une finesse qui n'existe pas. La forme dit exactement ce
 * qu'on sait.
 *
 * MOBILE
 *
 * Le plus petit repère fait seize unités de large sur cent vingt : rendu sur la
 * largeur d'un iPhone, cela dépasse les quarante-quatre points recommandés. La
 * bascule face/dos est une rangée de deux boutons pleine largeur, pas un
 * interrupteur de la taille d'un ongle.
 */

interface CommunProps {
  /** Face imposée. Sans elle, le composant garde la sienne. */
  face?: Face;
  onFaceChange?: (face: Face) => void;
  /** Masque la rangée face/dos : l'appelant la fournit ailleurs. */
  sansBascule?: boolean;
  className?: string;
}

interface ModeDouleurProps extends CommunProps {
  mode: "douleur";
  /** Identifiants de régions sélectionnées, les deux faces confondues. */
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
}

interface ModeExerciceProps extends CommunProps {
  mode: "exercice";
  musclesPrincipaux: readonly Muscle[];
  musclesSecondaires: readonly Muscle[];
}

type Props = ModeDouleurProps | ModeExerciceProps;

/** Référence stable : un `[]` neuf à chaque rendu recalculerait le mémo. */
const VIDE: readonly Muscle[] = [];

function Trace({ forme, ...reste }: { forme: Forme } & React.SVGProps<SVGRectElement & SVGEllipseElement>) {
  return forme.type === "rect"
    ? <rect x={forme.x} y={forme.y} width={forme.w} height={forme.h} rx={forme.rx} {...reste} />
    : <ellipse cx={forme.cx} cy={forme.cy} rx={forme.rx} ry={forme.ry} {...reste} />;
}

/**
 * La silhouette, sous les régions.
 *
 * Elle n'est pas interactive et ne porte aucune donnée : elle sert à rendre les
 * repères lisibles comme un corps plutôt que comme un nuage de pastilles.
 */
function Silhouette() {
  return (
    <g className="fill-encre/[0.07] dark:fill-papier/[0.09]" aria-hidden>
      <circle cx={60} cy={22} r={14} />
      <rect x={52} y={33} width={16} height={14} rx={5} />
      <path d="M60 44 L96 54 Q102 56 102 64 L102 104 Q102 110 96 110 L92 110 L88 92 L84 126 Q84 136 78 140 L78 250 Q78 256 71 256 Q64 256 64 250 L61 150 L59 150 L56 250 Q56 256 49 256 Q42 256 42 250 L42 140 Q36 136 36 126 L32 92 L28 110 L24 110 Q18 110 18 104 L18 64 Q18 56 24 54 Z" />
    </g>
  );
}

const TEINTES: Record<Sollicitation, string> = {
  // Le contraste porte l'information, pas la seule couleur : le principal est
  // aussi cerné d'un trait plein, le secondaire d'un trait fin.
  principal: "fill-encre/70 stroke-encre",
  secondaire: "fill-encre/25 stroke-encre/40",
  aucun: "fill-transparent stroke-encre/15",
};

export function Mannequin(props: Props) {
  const idBase = useId();
  const [faceLocale, setFaceLocale] = useState<Face>("face");
  const face = props.face ?? faceLocale;
  const changerFace = (f: Face) => {
    setFaceLocale(f);
    props.onFaceChange?.(f);
  };

  const regions = useMemo(() => regionsDeLaFace(face), [face]);

  const principaux = props.mode === "exercice" ? props.musclesPrincipaux : VIDE;
  const secondaires = props.mode === "exercice" ? props.musclesSecondaires : VIDE;
  const sollicitation = useMemo(
    () => sollicitationDesRegions(principaux, secondaires),
    [principaux, secondaires],
  );

  const interactif = props.mode === "douleur";

  const basculer = (r: RegionAnatomique) => {
    if (props.mode !== "douleur") return;
    const dedans = props.selection.includes(r.id);
    props.onSelectionChange(
      dedans ? props.selection.filter((x) => x !== r.id) : [...props.selection, r.id],
    );
  };

  return (
    <div className={props.className}>
      {!props.sansBascule && (
        /* Deux boutons pleine largeur : une bascule minuscule se rate au pouce,
           et c'est le geste le plus fréquent de tout l'écran. */
        <div role="group" aria-label="Face montrée" className="flex gap-2 mb-3">
          {FACES.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={face === f}
              onClick={() => changerFace(f)}
              className={`flex-1 h-11 rounded-xl border text-sm transition-colors ${
                face === f
                  ? "bg-encre text-papier border-encre font-medium"
                  : "bg-papier-2 text-encre-2 border-filet"
              }`}
            >
              {LIBELLES_FACE[f]}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${VUE.largeur} ${VUE.hauteur}`}
        className="w-full max-w-[300px] mx-auto block h-auto text-encre"
        role={interactif ? "group" : "img"}
        aria-label={
          interactif
            ? `Silhouette ${LIBELLES_FACE[face].toLowerCase()} : touche une zone pour la signaler`
            : `Muscles travaillés, vue ${LIBELLES_FACE[face].toLowerCase()}`
        }
      >
        <Silhouette />

        {regions.map((r) => {
          const choisie = props.mode === "douleur" && props.selection.includes(r.id);
          const niveau = sollicitation.get(r.id) ?? "aucun";

          if (!interactif) {
            return (
              <Trace
                key={r.id}
                forme={r.forme}
                strokeWidth={niveau === "principal" ? 1.6 : 0.8}
                className={`${TEINTES[niveau]} transition-colors`}
              >
                {niveau !== "aucun" && <title>{`${r.libelleComplet} — ${niveau}`}</title>}
              </Trace>
            );
          }

          return (
            <Trace
              key={r.id}
              forme={r.forme}
              role="checkbox"
              aria-checked={choisie}
              aria-label={r.libelleComplet}
              tabIndex={0}
              onClick={() => basculer(r)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                basculer(r);
              }}
              strokeWidth={choisie ? 2 : 1}
              // `touch-action` : sans lui, un appui maintenu sur une zone
              // déclenche le défilement de la feuille au lieu de la sélection.
              style={{ touchAction: "manipulation" }}
              className={`cursor-pointer outline-none transition-colors ${
                choisie
                  ? "fill-perte/70 stroke-perte"
                  : "fill-encre/[0.08] stroke-encre/30 hover:fill-encre/20"
              } focus-visible:stroke-encre focus-visible:[stroke-width:2.5]`}
            >
              <title>{r.libelleComplet}</title>
            </Trace>
          );
        })}
      </svg>

      {/* Ce qui est sélectionné, en toutes lettres — LES DEUX FACES comprises.
          Le dessin seul ne suffit pas : il faut pouvoir vérifier qu'on a bien
          désigné l'épaule GAUCHE, et une zone choisie de dos ne doit pas
          disparaître de la liste quand on revient de face. Le lecteur d'écran,
          lui, n'a que ce texte. */}
      {props.mode === "douleur" && (
        <p aria-live="polite" className="text-sm text-encre-2 mt-2 min-h-5" id={`${idBase}-choix`}>
          {props.selection.length === 0
            ? "Touche l'endroit où ça gêne."
            : props.selection
              .map((id) => REGIONS_PAR_ID.get(id))
              .filter((r): r is RegionAnatomique => Boolean(r))
              .map((r) => r.libelleComplet)
              .join(" · ")}
        </p>
      )}
    </div>
  );
}
