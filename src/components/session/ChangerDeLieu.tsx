"use client";
import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages";
import { useRouter } from "next/navigation";
import { MapPin, ArrowRight, AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MATERIEL_PORTABLE, LIBELLES_PORTABLE } from "@/lib/referentiels/capacites";

/**
 * « Je ne peux pas aller à la salle aujourd'hui. »
 *
 * L'écran montre ce qui changerait AVANT de changer quoi que ce soit : une
 * séance déjà commencée dans la tête ne doit pas se réécrire sous les yeux de
 * quelqu'un sans qu'il ait vu quoi ni pourquoi. L'aperçu et l'application
 * passent par le même calcul serveur, donc ce qui est montré est exactement ce
 * qui sera appliqué.
 */

interface Remplacement {
  planItemId: string;
  avant: string;
  apres: string;
  raison: string;
}

interface Apercu {
  lieu: { id: string; nom: string };
  qualite: "equivalente" | "degradee" | "insuffisante";
  libelleQualite: string;
  explicationQualite: string;
  motifs: string[];
  conserves: number;
  remplacements: Remplacement[];
  retires: Array<{ nom: string; raison: string }>;
  reconstructionConseillee: boolean;
  motifReconstruction: string | null;
  validation: {
    valide: boolean;
    seance: { anomalies: Array<{ gravite: string; message: string }>; dureeEstimeeMinutes: number; seriesTotales: number };
    semaine: { anomalies: Array<{ gravite: string; message: string }> };
    cycle: { aligne: boolean; ecartVolumePct: number; motifs: string[] };
  };
}

interface Props {
  sessionLogId: string;
  lieuActuelId: string;
  onApplique: () => void;
}

export function ChangerDeLieu({ sessionLogId, lieuActuelId, onApplique }: Props) {
  const router = useRouter();
  const [lieux, setLieux] = useState<Array<{ id: string; nom: string }>>([]);
  const [lieuChoisi, setLieuChoisi] = useState(lieuActuelId);
  const [materiel, setMateriel] = useState<string[]>([]);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gyms")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setLieux(d.map((g: { id: string; nom: string }) => ({ id: g.id, nom: g.nom }))))
      .catch(() => {});
  }, []);

  const appeler = async (appliquer: boolean) => {
    const majEtat = appliquer ? setEnvoi : setCalcul;
    majEtat(true);
    setErreur(null);
    try {
      const res = await fetch("/api/seance-du-jour/adapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionLogId,
          gymId: lieuChoisi,
          materielApporte: materiel,
          apercu: !appliquer,
        }),
      });
      const corps = await res.json().catch(() => null);
      if (!res.ok || !corps) throw new Error(corps?.error ?? messageErreur("adapter ta séance", null, res.status));
      if (appliquer) {
        router.refresh();
        onApplique();
      } else {
        setApercu(corps);
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Requête impossible");
    } finally {
      majEtat(false);
    }
  };

  const bloquantes = [
    ...(apercu?.validation.seance.anomalies ?? []),
    ...(apercu?.validation.semaine.anomalies ?? []),
  ].filter((a) => a.gravite === "bloquant");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-encre font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4" aria-hidden />
          Où t&apos;entraînes-tu aujourd&apos;hui ?
        </p>
        <div className="flex flex-wrap gap-2">
          {lieux.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={l.id === lieuChoisi}
              onClick={() => { setLieuChoisi(l.id); setApercu(null); }}
              className={`rounded-lg border px-3 py-2 text-sm ${
                l.id === lieuChoisi
                  ? "border-encre bg-encre text-papier"
                  : "border-filet bg-carte text-encre-2"
              }`}
            >
              {l.nom}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-encre-3 text-xs uppercase tracking-wide">Matériel emporté</p>
        <div className="flex flex-wrap gap-2">
          {MATERIEL_PORTABLE.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={materiel.includes(m)}
              onClick={() => {
                setMateriel((l) => (l.includes(m) ? l.filter((x) => x !== m) : [...l, m]));
                setApercu(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                materiel.includes(m)
                  ? "border-encre bg-encre text-papier"
                  : "border-filet bg-carte text-encre-2"
              }`}
            >
              {LIBELLES_PORTABLE[m]}
            </button>
          ))}
        </div>
      </div>

      {erreur && <p className="text-perte text-sm">{erreur}</p>}

      {!apercu ? (
        <Button className="w-full h-11 bg-encre text-papier" disabled={calcul} onClick={() => appeler(false)}>
          {calcul ? <Loader2 className="w-4 h-4 animate-spin" /> : "Voir ce que ça change"}
        </Button>
      ) : (
        <div className="space-y-3">
          {/* Le niveau d'abord : c'est ce qui décide s'il faut lire le détail. */}
          <div
            className={`rounded-xl border p-3 ${
              apercu.qualite === "equivalente"
                ? "border-gain/30 bg-gain-fond"
                : apercu.qualite === "degradee"
                  ? "border-filet bg-carte"
                  : "border-feu-orange/30 bg-feu-orange/10"
            }`}
          >
            <p className="text-encre font-semibold text-sm">{apercu.libelleQualite}</p>
            <p className="text-encre-2 text-xs mt-0.5">{apercu.explicationQualite}</p>
            {apercu.motifs.map((m) => (
              <p key={m} className="text-encre-2 text-xs mt-1">{m}</p>
            ))}
          </div>

          <div className="rounded-xl border border-filet bg-carte p-4 space-y-3">
            <p className="text-encre text-sm">
              <span className="chiffres font-semibold">{apercu.conserves}</span> exercice
              {apercu.conserves > 1 ? "s" : ""} inchangé{apercu.conserves > 1 ? "s" : ""}
              {apercu.remplacements.length > 0 && (
                <>
                  , <span className="chiffres font-semibold">{apercu.remplacements.length}</span> remplacé
                  {apercu.remplacements.length > 1 ? "s" : ""}
                </>
              )}
              {apercu.retires.length > 0 && (
                <>
                  , <span className="chiffres font-semibold">{apercu.retires.length}</span> retiré
                  {apercu.retires.length > 1 ? "s" : ""}
                </>
              )}
              .
            </p>

            {apercu.remplacements.map((r) => (
              <div key={r.planItemId} className="text-sm">
                <p className="flex items-center gap-2 flex-wrap text-encre">
                  <span className="text-encre-3 line-through">{r.avant}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-encre-3" aria-hidden />
                  <span className="font-medium">{r.apres}</span>
                </p>
                <p className="text-encre-3 text-xs">{r.raison}</p>
              </div>
            ))}

            {apercu.retires.map((r) => (
              <p key={r.nom} className="text-sm text-encre-2">
                <span className="line-through">{r.nom}</span>{" "}
                <span className="text-encre-3 text-xs">— {r.raison}</span>
              </p>
            ))}

            <p className="text-encre-3 text-xs">
              Séries et répétitions inchangées : c&apos;est le même travail, fait autrement.
            </p>
          </div>

          {(apercu.reconstructionConseillee || bloquantes.length > 0 || !apercu.validation.cycle.aligne) && (
            <div className="rounded-xl border border-feu-orange/30 bg-feu-orange/10 p-4 space-y-1.5">
              {apercu.reconstructionConseillee && (
                <p className="text-sm text-encre flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-feu-orange" aria-hidden />
                  <span>Mieux vaut construire une autre séance que forcer celle-ci.</span>
                </p>
              )}
              {apercu.validation.cycle.motifs.map((m) => (
                <p key={m} className="text-sm text-encre-2">{m}</p>
              ))}
              {bloquantes.map((a) => (
                <p key={a.message} className="text-sm text-encre-2">{a.message}</p>
              ))}
            </div>
          )}

          <Button
            className="w-full h-11 bg-encre text-papier"
            disabled={envoi}
            onClick={() => appeler(true)}
          >
            {envoi ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Adapter ma séance
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
