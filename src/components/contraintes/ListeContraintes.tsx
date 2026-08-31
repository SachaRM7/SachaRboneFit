"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { messageErreur } from "@/lib/messages";

interface Affichee {
  id: string;
  libelle: string;
  severite: number;
  dateDebut: string;
  dateFin: string | null;
  aReevaluerMaintenant: boolean;
  effets: string[];
}

/** « 28 août » plutôt que « 2026-08-28 ». */
function enClair(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long",
  });
}

const NIVEAU = (severite: number) =>
  severite >= 7 ? "Gêne marquée" : severite >= 4 ? "Gêne modérée" : "Gêne légère";

export function ListeContraintes({
  actives, passees,
}: {
  actives: Affichee[];
  passees: Affichee[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function repondre(id: string, reponse: "toujours" | "un_peu_mieux" | "resolu") {
    setEnCours(id);
    setErreur(null);
    try {
      const res = await fetch(`/api/contraintes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reponse }),
      });
      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(messageErreur("mettre à jour cette gêne", corps?.error, res.status));
      }
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="text-perte text-sm">{erreur}</p>}

      <div className="space-y-3">
        {actives.map((c) => (
          <div key={c.id} className="rounded-2xl border border-filet bg-carte p-4 space-y-3">
            <div>
              <p className="text-encre">{c.libelle}</p>
              <p className="text-encre-3 text-sm">
                {NIVEAU(c.severite)} · depuis le {enClair(c.dateDebut)}
              </p>
            </div>

            <ul className="text-encre-2 text-xs space-y-1">
              {c.effets.map((e) => <li key={e}>{e}</li>)}
            </ul>

            {/* La question ne se pose qu'à l'échéance. Le reste du temps,
                l'athlète peut quand même dire que ça va mieux : une gêne qui
                passe n'a pas à attendre une date. */}
            {c.aReevaluerMaintenant ? (
              <div className="space-y-2">
                <p className="text-encre text-sm">Est-ce toujours le cas ?</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline" disabled={enCours !== null}
                    onClick={() => void repondre(c.id, "toujours")}
                    className="flex-1 bg-carte border-filet text-encre rounded-full h-11"
                  >
                    Oui
                  </Button>
                  <Button
                    variant="outline" disabled={enCours !== null}
                    onClick={() => void repondre(c.id, "un_peu_mieux")}
                    className="flex-1 bg-carte border-filet text-encre rounded-full h-11"
                  >
                    Un peu
                  </Button>
                  {/* Les trois réponses ont le même poids visuel. Mettre
                      « Non » en avant reviendrait à pousser l'athlète à se
                      déclarer guéri pour se débarrasser de la question. */}
                  <Button
                    variant="outline" disabled={enCours !== null}
                    onClick={() => void repondre(c.id, "resolu")}
                    className="flex-1 bg-carte border-filet text-encre rounded-full h-11"
                  >
                    Non
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={enCours !== null}
                onClick={() => void repondre(c.id, "resolu")}
                className="w-full bg-encre text-papier hover:bg-filet rounded-full h-11"
              >
                {enCours === c.id ? "Un instant…" : "Ça va mieux"}
              </Button>
            )}
          </div>
        ))}
      </div>

      {passees.length > 0 && (
        <details className="rounded-2xl border border-filet bg-carte p-4">
          <summary className="text-encre-2 text-sm cursor-pointer">
            Gênes passées ({passees.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {passees.map((c) => (
              <li key={c.id} className="text-encre-3 text-sm">
                {c.libelle} · du {enClair(c.dateDebut)}
                {c.dateFin ? ` au ${enClair(c.dateFin)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
