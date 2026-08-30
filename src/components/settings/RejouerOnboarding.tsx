"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rejouer le parcours depuis le début.
 *
 * Le geste est destructeur et sans corbeille, donc il se fait en deux temps :
 * on annonce ce qui va disparaître, et seul un second appui l'exécute. Un
 * bouton unique dans une liste de réglages se presse par accident.
 *
 * Ce qui n'est jamais touché est dit ici plutôt que laissé à deviner : le
 * catalogue d'exercices et les lieux d'un autre compte.
 */

interface Resume {
  seances: number;
  series: number;
  blocs: number;
  gabarits: number;
  conversations: number;
  lieuxSupprimes: string[];
  lieuxConserves: Array<{ nom: string; raison: string }>;
}

export function RejouerOnboarding() {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [supprimerLieux, setSupprimerLieux] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  const executer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/compte/reinitialiser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "REINITIALISER", supprimerMesLieux: supprimerLieux }),
      });
      const corps = await res.json().catch(() => null);
      if (!res.ok || !corps) throw new Error(corps?.error ?? `HTTP ${res.status}`);
      setResume(corps.resume);
      router.refresh();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Réinitialisation impossible");
    } finally {
      setEnvoi(false);
    }
  };

  if (resume) {
    return (
      <section className="rounded-xl border border-filet bg-carte p-4 space-y-2">
        <p className="text-encre font-semibold">Compte remis à zéro</p>
        <p className="text-encre-2 text-sm">
          <span className="chiffres">{resume.seances}</span> séance
          {resume.seances > 1 ? "s" : ""}, <span className="chiffres">{resume.series}</span> série
          {resume.series > 1 ? "s" : ""}, <span className="chiffres">{resume.blocs}</span> bloc
          {resume.blocs > 1 ? "s" : ""} et <span className="chiffres">{resume.conversations}</span>{" "}
          conversation{resume.conversations > 1 ? "s" : ""} effacés.
        </p>
        {resume.lieuxSupprimes.length > 0 && (
          <p className="text-encre-2 text-sm">Lieux supprimés : {resume.lieuxSupprimes.join(", ")}.</p>
        )}
        {resume.lieuxConserves.map((l) => (
          <p key={l.nom} className="text-encre-2 text-sm">
            {l.nom} conservé — {l.raison}.
          </p>
        ))}
        <Button className="w-full h-11 bg-encre text-papier mt-1" onClick={() => router.push("/bienvenue")}>
          Recommencer l&apos;onboarding
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-filet bg-carte p-4 space-y-3">
      <div>
        <p className="text-encre font-semibold flex items-center gap-2">
          <RotateCcw className="w-4 h-4" aria-hidden />
          Rejouer le parcours depuis le début
        </p>
        <p className="text-encre-2 text-sm mt-1">
          Efface tes séances, tes séries, tes programmes, tes états du jour et tes conversations,
          puis rouvre l&apos;onboarding. Le catalogue d&apos;exercices et les lieux d&apos;un autre
          compte ne sont jamais touchés.
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-encre-2">
        <input
          type="checkbox"
          checked={supprimerLieux}
          onChange={(e) => { setSupprimerLieux(e.target.checked); setConfirme(false); }}
          className="mt-0.5"
        />
        <span>
          Supprimer aussi les lieux que j&apos;ai créés et leurs exercices.
          <span className="block text-encre-3 text-xs">
            Un lieu où un autre compte s&apos;est entraîné est conservé.
          </span>
        </span>
      </label>

      {erreur && <p className="text-perte text-sm">{erreur}</p>}

      {!confirme ? (
        <Button
          variant="outline"
          className="w-full h-11 border-perte/40 text-perte"
          onClick={() => setConfirme(true)}
        >
          Remettre à zéro
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-perte text-sm">
            C&apos;est définitif : rien n&apos;est mis en corbeille.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1 h-11 text-encre-2"
              onClick={() => setConfirme(false)}
              disabled={envoi}
            >
              Annuler
            </Button>
            <Button
              className="flex-1 h-11 bg-perte text-papier"
              onClick={executer}
              disabled={envoi}
            >
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
