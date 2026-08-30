"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { LIBELLES_EQUIPEMENT, type Equipement } from "@/lib/referentiels/equipements";
import { CAPACITES, FAMILLES_A_COCHER, LIBELLES_CAPACITE } from "@/lib/referentiels/capacites";

/**
 * Le matériel présent sur place.
 *
 * C'est la saisie qui remplace l'énumération exercice par exercice. Cocher
 * « haltères » rend d'un coup faisable tout ce qui n'a besoin que d'haltères ;
 * il ne reste à décrire en détail que les appareils qu'on charge, parce qu'eux
 * seuls ont des incréments à relever.
 *
 * Le poids du corps n'apparaît pas : il est disponible partout, et le proposer
 * comme une case à cocher laisserait croire qu'on peut ne pas l'avoir.
 *
 * Deux niveaux, parce que les familles ne se valent pas. Une barre est une
 * barre ; « machine » recouvrait quinze appareils, et une seule case aurait
 * rendu faisable un leg curl absent parce qu'on a vu une presse. Les machines
 * se cochent donc une par une — ce qui est exactement la façon dont on
 * inventorie une salle en la parcourant.
 */

const GROUPES: Array<{ titre: string; valeurs: readonly string[]; libelle: (v: string) => string }> = [
  {
    titre: "Matériel libre",
    valeurs: FAMILLES_A_COCHER,
    libelle: (v) => LIBELLES_EQUIPEMENT[v as Equipement] ?? v,
  },
  {
    titre: "Appareils",
    valeurs: CAPACITES,
    libelle: (v) => LIBELLES_CAPACITE[v as keyof typeof LIBELLES_CAPACITE] ?? v,
  },
];

interface Props {
  gymId: string;
  equipements: string[];
  /** Combien d'exercices chaque type encore absent rendrait possibles ici. */
  apports: Record<string, number>;
  lectureSeule?: boolean;
}

export function MaterielDuLieu({ gymId, equipements, apports, lectureSeule = false }: Props) {
  const router = useRouter();
  const [choisis, setChoisis] = useState<string[]>(equipements);
  const [envoi, setEnvoi] = useState(false);

  const basculer = async (e: string) => {
    if (lectureSeule || envoi) return;
    const suivant = choisis.includes(e) ? choisis.filter((x) => x !== e) : [...choisis, e];
    // L'état local part en avant : la case doit répondre au doigt, pas au réseau.
    setChoisis(suivant);
    setEnvoi(true);
    try {
      const res = await fetch(`/api/gyms/${gymId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipementsDisponibles: suivant }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "");
      router.refresh();
    } catch (cause) {
      setChoisis(choisis);
      toast.error(cause instanceof Error && cause.message ? cause.message : "Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">
          Matériel sur place
        </h2>
        <p className="text-encre-3 text-xs mt-0.5">
          {lectureSeule
            ? "Ce que ce lieu permet d'utiliser."
            : "Coche ce que tu vois en parcourant la salle. Tout ce qui ne demande que ça devient proposable, sans saisir un exercice à la fois."}
        </p>
      </div>

      {GROUPES.map((groupe) => (
        <div key={groupe.titre} className="space-y-1.5">
          <p className="text-encre-3 text-xs uppercase tracking-wide">{groupe.titre}</p>
          <div className="flex flex-wrap gap-2">
            {groupe.valeurs.map((e) => {
              const actif = choisis.includes(e);
              const enPlus = apports[e] ?? 0;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => basculer(e)}
                  disabled={lectureSeule}
                  aria-pressed={actif}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    actif
                      ? "border-encre bg-encre text-papier"
                      : "border-filet bg-carte text-encre-2 hover:text-encre"
                  } ${lectureSeule ? "opacity-70" : ""}`}
                >
                  {actif && <Check className="w-3.5 h-3.5" aria-hidden />}
                  <span>{groupe.libelle(e)}</span>
                  {!actif && enPlus > 0 && (
                    <span className="chiffres text-xs text-encre-3">+{enPlus}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-encre-3 text-xs">
        Le poids du corps est toujours disponible. Le chiffre indique combien d&apos;exercices
        chaque matériel rendrait possibles ici.
      </p>
    </section>
  );
}
