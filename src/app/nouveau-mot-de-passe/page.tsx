"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const LONGUEUR_MINIMALE = 8;

/**
 * Choix d'un nouveau mot de passe, après clic sur le lien reçu par courriel.
 *
 * Le lien de récupération ouvre une session limitée : le client Supabase la
 * détecte au chargement. Sans session valide, la page le dit plutôt que
 * d'afficher un formulaire qui échouerait à l'envoi.
 */
export default function PageNouveauMotDePasse() {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [sessionValide, setSessionValide] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Le jeton de récupération arrive dans le fragment d'URL ; le client le
    // consomme de façon asynchrone, d'où l'écoute plutôt qu'une lecture directe.
    const { data: abonnement } = supabase.auth.onAuthStateChange((_evenement, session) => {
      if (session) setSessionValide(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSessionValide((valide) => valide ?? Boolean(data.session));
    });

    return () => abonnement.subscription.unsubscribe();
  }, []);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");

    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setErreur(`Le mot de passe doit faire au moins ${LONGUEUR_MINIMALE} caractères.`);
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setEnvoi(true);
    const { error } = await createClient().auth.updateUser({ password: motDePasse });

    if (error) {
      setErreur(error.message);
      setEnvoi(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (sessionValide === false) {
    return (
      <div className="min-h-screen bg-papier text-encre flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-carte border-filet">
          <CardHeader>
            <CardTitle className="text-encre">Lien expiré</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-encre-2 text-sm">
              Ce lien de réinitialisation n&apos;est plus valable. Ils expirent au bout
              d&apos;une heure et ne servent qu&apos;une fois.
            </p>
            <Link href="/mot-de-passe-oublie" className="block">
              <Button className="w-full bg-encre text-papier hover:bg-encre/90">
                Demander un nouveau lien
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-papier text-encre flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre">Nouveau mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enregistrer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mdp" className="text-encre-2">Mot de passe</Label>
              <Input
                id="mdp" type="password" required autoComplete="new-password"
                value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                className="bg-papier-2 border-filet text-encre"
              />
              <p className="text-encre-3 text-xs">{LONGUEUR_MINIMALE} caractères minimum.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmation" className="text-encre-2">Confirmer</Label>
              <Input
                id="confirmation" type="password" required autoComplete="new-password"
                value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                className="bg-papier-2 border-filet text-encre"
              />
            </div>

            {erreur && <p className="text-perte text-sm">{erreur}</p>}

            <Button type="submit" disabled={envoi || sessionValide === null}
              className="w-full bg-encre text-papier hover:bg-encre/90">
              {envoi ? "Enregistrement…" : "Enregistrer et me connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
