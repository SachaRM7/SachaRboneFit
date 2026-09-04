import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { essentielTableauDeBord } from "@/services/tableau-de-bord";
import { ContenuTableauDeBord } from "@/components/dashboard/ContenuTableauDeBord";
import { CarteProgramme } from "@/components/dashboard/CarteProgramme";
import { ComplementTableauDeBord } from "@/components/dashboard/ComplementTableauDeBord";
import { phase, publier } from "@/lib/mesure/trace";

/**
 * L'accueil, rendu par le serveur — et plus en une seule attente.
 *
 * C'était un composant client qui appelait `/api/dashboard` après son montage :
 * HTML, JavaScript, requête, rendu, quatre étapes en série. Les données sont
 * arrivées avec le HTML, ce qui a supprimé trois de ces étapes ; restait la
 * dernière, et elle attendait une trentaine de requêtes sérialisées.
 *
 * Deux tiers de ces requêtes ne décident de rien. Ce qui est attendu ici tient
 * à ce dont dépend le premier geste : le bonjour, l'état du jour, la séance à
 * faire, le feu. Le raccourci vers le programme et le reste arrivent derrière
 * une limite de suspension, en flux, dès qu'ils sont prêts.
 *
 * Ce n'est pas un squelette posé devant une attente inchangée : le travail
 * bloquant diminue réellement, et ce qui suit ne bloque plus rien.
 */
export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const essentiel = await phase("calcul", "essentielTableauDeBord", () =>
    essentielTableauDeBord(userId),
  );

  /*
   * Le chemin critique s'arrête ici, et cette ligne le date.
   *
   * L'écart entre cette ligne et celle du complément EST la mesure du
   * streaming : si les deux tombent au même instant, rien n'est streamé et la
   * limite de suspension ne sert à rien. Vercel, lui, ne mesure que la fin de
   * la réponse — il ne peut pas dire quand le premier contenu est parti.
   */
  publier("essentiel");

  return (
    <ContenuTableauDeBord
      data={essentiel}
      carteProgramme={
        <Suspense fallback={<CadreProgrammeEnAttente />}>
          <CarteProgramme userId={userId} />
        </Suspense>
      }
      complement={
        <Suspense fallback={<CadreComplementEnAttente />}>
          <ComplementTableauDeBord userId={userId} />
        </Suspense>
      }
    />
  );
}

/*
 * Les deux attentes réservent la place de ce qui arrive, sans dessiner de
 * fausses valeurs : un squelette qui imite un chiffre fait lire une donnée qui
 * n'existe pas. La hauteur est celle du bloc réel, pour que rien ne saute
 * quand il se substitue.
 */
function CadreProgrammeEnAttente() {
  return (
    <div className="px-4 pb-2" aria-hidden>
      <div className="h-[58px] rounded-xl bg-papier-2 animate-pulse" />
    </div>
  );
}

function CadreComplementEnAttente() {
  return (
    <div className="h-24 rounded-xl bg-papier-2 animate-pulse" aria-hidden />
  );
}
