"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nom,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Sans session (confirmation d'email activee sur le projet Supabase), la ligne
    // applicative sera creee a la premiere connexion : l'API n'accepte que l'identite
    // de la session authentifiee.
    if (!signUpData.session) {
      toast.success("Compte créé. Confirme ton email puis connecte-toi.");
      router.push("/login");
      setLoading(false);
      return;
    }

    // L'API derive l'id et l'email de la session ; on ne transmet que le nom.
    const res = await fetch("/api/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom }),
    });

    if (!res.ok) {
      setError("Compte créé mais erreur lors de la création du profil. Connecte-toi pour réessayer.");
      setLoading(false);
      return;
    }

    toast.success("Compte créé !");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-papier text-encre flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Sport Perso</h1>
          <p className="text-encre-3 mt-2">Crée ton compte</p>
        </div>

        <Card className="bg-carte border-filet">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  type="text"
                  placeholder="Ton prénom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  className="bg-papier-2 border-filet"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ton@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-papier-2 border-filet"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-papier-2 border-filet"
                />
              </div>

              {error && (
                <p className="text-perte text-sm">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-encre text-papier hover:bg-filet"
                disabled={loading}
              >
                {loading ? "Création..." : "Créer mon compte"}
              </Button>
            </form>

            <p className="text-center text-encre-3 text-sm mt-4">
              Déjà un compte ?{" "}
              <Link href="/login" className="text-encre hover:underline">
                Se connecter
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
