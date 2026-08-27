"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Demande de réinitialisation du mot de passe.
 *
 * L'application n'offrait aucun moyen de récupérer un compte : ni lien depuis
 * l'écran de connexion, ni page. Un mot de passe oublié fermait définitivement
 * l'accès, avec toutes les séances derrière.
 */
export default function PageMotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState("");

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");

    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });

    if (error) {
      setErreur(error.message);
      setEnvoi(false);
      return;
    }

    setEnvoye(true);
    setEnvoi(false);
  };

  return (
    <div className="min-h-screen bg-papier text-encre flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre">Mot de passe oublié</CardTitle>
        </CardHeader>
        <CardContent>
          {envoye ? (
            <div className="space-y-4">
              <p className="text-encre-2 text-sm">
                Si un compte existe pour <span className="font-medium text-encre">{email}</span>,
                un lien de réinitialisation vient d&apos;y être envoyé. Il est valable une heure.
              </p>
              <p className="text-encre-3 text-xs">
                Pense à regarder dans les indésirables.
              </p>
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full border-filet bg-papier-2 text-encre-2">
                  Retour à la connexion
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={envoyer} className="space-y-4">
              <p className="text-encre-2 text-sm">
                Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.
              </p>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-encre-2">Email</Label>
                <Input
                  id="email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="bg-papier-2 border-filet text-encre"
                />
              </div>

              {erreur && <p className="text-perte text-sm">{erreur}</p>}

              <Button type="submit" disabled={envoi}
                className="w-full bg-encre text-papier hover:bg-encre/90">
                {envoi ? "Envoi…" : "Envoyer le lien"}
              </Button>

              <p className="text-center text-sm text-encre-3">
                <Link href="/login" className="text-encre hover:underline">
                  Retour à la connexion
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
