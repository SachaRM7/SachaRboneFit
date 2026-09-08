"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { messageErreur } from "@/lib/messages";
import { SEVERITE, INTENSITE_MINIMALE_REPETITION } from "@/lib/engine/contraintes";

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

/**
 * Le libellé suit le seuil du moteur, il ne le redéfinit pas.
 *
 * « Marquée » doit vouloir dire « celle qui exclut » : écrire 7 ici en clair
 * aurait recréé la divergence qu'on vient de supprimer, à l'endroit le moins
 * visible — celui que personne ne relit en changeant une règle métier.
 */
const NIVEAU = (severite: number) =>
  severite >= SEVERITE.ecartement
    ? "Gêne marquée"
    : severite >= INTENSITE_MINIMALE_REPETITION
      ? "Gêne modérée"
      : "Gêne légère";

/**
 * Une gêne qui a fait proposer quelque chose, sans réponse à ce jour.
 *
 * Elle arrive ici parce qu'on n'a pas toujours pu poser la question sur le
 * moment : « Arrêter la séance » navigue aussitôt, et rien ne doit retarder cet
 * arrêt. Ce que la règle avait décidé est persisté avec l'incident ; la
 * confirmation ne fait que le désigner.
 */
interface EnAttente {
  incidentId: string;
  date: string;
  propositions: {
    zone: string;
    libelleMuscles: string;
    severite: number;
    motif: string;
    effets: string[];
  }[];
}

export function ListeContraintes({
  actives, passees, enAttente = [],
}: {
  actives: Affichee[];
  passees: Affichee[];
  enAttente?: EnAttente[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * Trancher une proposition en attente.
   *
   * Le corps ne porte ni zone, ni muscle, ni sévérité : le serveur relit ce que
   * la règle avait décidé sur CET incident. Le client ne fait que dire oui ou
   * non — il ne peut pas désigner autre chose.
   */
  async function decider(incidentId: string, decision: "appliquer" | "refuser") {
    setEnCours(incidentId);
    setErreur(null);
    try {
      const res = await fetch("/api/douleur/proteger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, decision }),
      });
      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(messageErreur("répondre à cette proposition", corps?.error, res.status));
      }
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setEnCours(null);
    }
  }

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

      {/* Ce qui attend une réponse passe devant : c'est une question posée, pas
          un état en cours. */}
      {enAttente.map((a) => (
        <div key={a.incidentId} className="rounded-2xl border border-encre bg-carte p-4 space-y-3">
          <p className="text-encre-3 text-xs">Gêne signalée le {enClair(a.date)}</p>
          {a.propositions.map((p) => (
            <div key={p.zone} className="space-y-2">
              <p className="text-encre">
                Tu veux que RboneFit ménage {p.zone.toLowerCase()} dans les prochaines séances ?
              </p>
              <p className="text-encre-3 text-sm">{p.motif}</p>
              <p className="text-encre-2 text-xs">
                Zones musculaires concernées : {p.libelleMuscles}.
              </p>
              <ul className="text-encre-2 text-xs space-y-1">
                {p.effets.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline" disabled={enCours !== null}
              onClick={() => void decider(a.incidentId, "refuser")}
              className="flex-1 bg-carte border-filet text-encre rounded-full h-11"
            >
              Pas maintenant
            </Button>
            <Button
              disabled={enCours !== null}
              onClick={() => void decider(a.incidentId, "appliquer")}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
            >
              {enCours === a.incidentId ? "Un instant…" : "Oui, la ménager"}
            </Button>
          </div>
        </div>
      ))}

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
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
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
