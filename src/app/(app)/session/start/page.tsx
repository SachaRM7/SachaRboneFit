"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Écran de démarrage de séance.
 *
 * Il contenait auparavant toute l'orchestration : cinq appels en cascade, trois
 * modules du moteur exécutés dans le navigateur, la création de la session, puis
 * un passage de relais par sessionStorage jamais relu. Il ne fait plus qu'appeler
 * le service serveur et afficher ce qui a été décidé.
 */
export default function SessionStartPage() {
  return (
    <Suspense fallback={<EcranAttente message="Chargement…" />}>
      <ContenuDemarrage />
    </Suspense>
  );
}

function EcranAttente({ message, erreur = false }: { message: string; erreur?: boolean }) {
  return (
    <div className="min-h-screen bg-papier flex items-center justify-center p-6">
      <p className={erreur ? "text-perte text-center" : "text-encre text-center"}>{message}</p>
    </div>
  );
}

interface Ecarte {
  exerciceNom: string;
  raison: string;
}

function ContenuDemarrage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecartes, setEcartes] = useState<Ecarte[] | null>(null);

  const date = searchParams.get("date");
  const gymId = searchParams.get("gymId");

  useEffect(() => {
    if (!date || !gymId) return;

    let annule = false;

    (async () => {
      const prochaineRes = await fetch("/api/programme/prochaine-seance");
      if (!prochaineRes.ok) {
        if (!annule) setErreur("Aucun programme actif. Crée un bloc et ses séances.");
        return;
      }
      const prochaine = await prochaineRes.json();

      const res = await fetch("/api/seance-du-jour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, gymId, seanceTemplateId: prochaine.template.id }),
      });

      if (!res.ok) {
        if (!annule) setErreur("Impossible de construire la séance.");
        return;
      }

      const resultat = await res.json();
      if (annule) return;

      const destination = `/sessions/new/${prochaine.template.id}?gymId=${gymId}&sessionId=${resultat.seance.id}`;

      // Les exercices écartés faute d'équivalent dans la salle méritent d'être vus
      // avant d'entrer en séance : c'est une décision de l'application.
      if (resultat.ecartes?.length > 0) {
        setEcartes(resultat.ecartes);
        setTimeout(() => router.push(destination), 3500);
        return;
      }

      router.push(destination);
    })().catch(() => {
      if (!annule) setErreur("Une erreur est survenue.");
    });

    return () => { annule = true; };
  }, [date, gymId, router]);

  if (!date || !gymId) return <EcranAttente message="Paramètres manquants" erreur />;
  if (erreur) return <EcranAttente message={erreur} erreur />;

  if (ecartes) {
    return (
      <div className="min-h-screen bg-papier flex items-center justify-center p-6">
        <div className="max-w-sm space-y-3">
          <p className="text-encre font-medium">Séance adaptée à cette salle</p>
          <ul className="space-y-2">
            {ecartes.map((e) => (
              <li key={e.exerciceNom} className="text-sm text-encre-2">
                <span className="text-encre-2">{e.exerciceNom}</span> — {e.raison}
              </li>
            ))}
          </ul>
          <p className="text-encre-3 text-xs">Ouverture de la séance…</p>
        </div>
      </div>
    );
  }

  return <EcranAttente message="Préparation de la séance…" />;
}
