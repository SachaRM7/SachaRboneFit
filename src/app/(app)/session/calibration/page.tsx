"use client";
import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages";
import Link from "next/link";
import { Loader2, AlertTriangle, Ruler } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { lienDemarrage } from "@/lib/engine/etat-du-jour";

/**
 * Préparation de la phase de calibration.
 *
 * L'utilisateur arrive ici avec une salle équipée et aucun programme. Cet écran
 * demande au serveur de construire les séances à partir du parc réel, puis
 * annonce ce qui a été décidé — y compris ce qui n'a pas pu l'être. Il ne
 * prétend jamais qu'une séance est prête quand elle ne l'est pas.
 */

interface Reponse {
  deja: boolean;
  salle?: { id: string; nom: string };
  seances: Array<{ id: string; lettre: string; nom: string }>;
  piliersNonCouverts?: string[];
  avertissements?: string[];
}

export default function PreparationCalibrationPage() {
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/programme/calibration", { method: "POST" });
        const corps = await res.json().catch(() => null);
        if (annule) return;
        if (!res.ok || !corps) {
          setErreur(messageErreur("préparer ta séance de calibration", corps?.error, res.status));
        } else {
          setReponse(corps);
        }
      } catch (cause) {
        if (!annule) setErreur(cause instanceof Error ? cause.message : "Requête impossible");
      }
    })();
    return () => { annule = true; };
  }, []);

  if (erreur) {
    return (
      <Cadre>
        <Card className="bg-perte-fond border-perte/30">
          <CardContent className="py-5 space-y-3">
            <p className="text-perte font-semibold">Je n&apos;ai pas pu préparer ta calibration</p>
            <p className="text-encre-2 text-sm">{erreur}</p>
            <Link href="/gyms" className={buttonVariants({ className: "w-full h-11 bg-encre text-papier" })}>
              Vérifier ma salle
            </Link>
          </CardContent>
        </Card>
      </Cadre>
    );
  }

  if (!reponse) {
    return (
      <Cadre>
        <div className="flex flex-col items-center gap-3 py-16 text-encre-2" aria-busy="true">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
          <p className="text-sm">Je regarde ce que ta salle permet…</p>
        </div>
      </Cadre>
    );
  }

  const salleId = reponse.salle?.id;

  return (
    <Cadre>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-encre-3">Phase de calibration</p>
        <h1 className="text-2xl font-bold text-encre">
          {reponse.deja ? "Ta calibration est déjà prête" : "Ta calibration est prête"}
        </h1>
        <p className="text-encre-2 text-sm leading-relaxed">
          {reponse.seances.length} séance{reponse.seances.length > 1 ? "s" : ""} construite
          {reponse.seances.length > 1 ? "s" : ""} à partir de ce que ta salle permet. Deux séries par
          exercice, jamais près de l&apos;échec : on cherche tes charges, pas encore tes limites.
        </p>
      </div>

      <Card className="bg-carte border-filet">
        <CardContent className="py-4 space-y-2">
          {reponse.seances.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <Ruler className="w-4 h-4 text-encre-3 shrink-0" aria-hidden />
              <span className="text-encre text-sm font-medium">{s.nom}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {reponse.avertissements && reponse.avertissements.length > 0 && (
        <Card className="bg-carte border-filet">
          <CardContent className="py-4 space-y-2">
            {reponse.avertissements.map((a) => (
              <p key={a} className="text-encre-2 text-sm flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-feu-orange" aria-hidden />
                <span>{a}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {salleId ? (
        <Link
          href={lienDemarrage(salleId)}
          className={buttonVariants({ className: "w-full h-11 text-base bg-encre text-papier hover:bg-filet" })}
        >
          Commencer ma première séance
        </Link>
      ) : (
        <Link
          href="/dashboard"
          className={buttonVariants({ className: "w-full h-11 text-base bg-encre text-papier hover:bg-filet" })}
        >
          Retour à l&apos;accueil
        </Link>
      )}
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-papier text-encre px-4 pt-8">
      <div className="mx-auto w-full max-w-lg space-y-4">{children}</div>
    </div>
  );
}
