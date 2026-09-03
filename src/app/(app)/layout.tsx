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
      <main className="pb-20">{children}</main>
      <BottomNav />
      <BoutonCoach />
    </FournisseurCoach>
  );
}
