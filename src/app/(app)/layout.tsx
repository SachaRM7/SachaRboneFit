import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { FournisseurCoach } from "@/components/coach/ContexteCoach";
import { BoutonCoach } from "@/components/coach/BoutonCoach";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { onboardingTermine } from "@/services/profil-cache";

export const dynamic = "force-dynamic";

/**
 * Toutes les pages de l'application passent par ici : c'est le seul endroit où
 * la question « ce compte a-t-il été configuré ? » peut être posée une fois
 * pour toutes. Sans ce garde, un nouveau compte arrive sur un tableau de bord
 * vide qui ne sait rien lui proposer.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");
  if (!(await onboardingTermine(userId))) redirect("/bienvenue");

  return (
    <FournisseurCoach>
      <ServiceWorkerRegister />
      <OfflineIndicator />
      {/*
        Les deux bords, une fois, pour tous les écrans.

        `pb-20` valait 5 rem — la hauteur supposée de la barre, plus une
        marge — et ignorait l'indicateur d'accueil : le dernier bloc de chaque
        écran finissait derrière la barre. Et rien ne réservait le haut, si
        bien que le premier titre passait sous l'heure et la batterie.

        Les en-têtes collants, eux, gèrent leur propre marge haute : ils se
        placent à `--marge-haut` pour ne pas glisser sous l'encoche.
      */}
      <main
        style={{
          paddingTop: "var(--marge-haut)",
          paddingBottom: "calc(var(--barre-nav) + 1rem)",
        }}
      >
        {children}
      </main>
      <BottomNav />
      <BoutonCoach />
    </FournisseurCoach>
  );
}
