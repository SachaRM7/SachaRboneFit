"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { EQUIPEMENTS, LIBELLES_EQUIPEMENT, type Equipement } from "@/lib/referentiels/equipements";

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
 */

const A_COCHER = EQUIPEMENTS.filter((e) => e !== "poids_du_corps");

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

  const basculer = async (e: Equipement) => {
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
            : "Coche ce qui existe ici. Tout ce qui ne demande que ça devient proposable, sans rien saisir d'autre."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {A_COCHER.map((e) => {
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
              <span>{LIBELLES_EQUIPEMENT[e]}</span>
              {!actif && enPlus > 0 && (
                <span className="chiffres text-xs text-encre-3">+{enPlus}</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-encre-3 text-xs">
        Le poids du corps est toujours disponible. Le chiffre indique combien d&apos;exercices
        chaque matériel rendrait possibles ici.
      </p>
    </section>
  );
}
