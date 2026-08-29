import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { CoachFAB } from "@/components/coach/CoachFAB";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Toutes les pages de l'application passent par ici : c'est le seul endroit où
 * la question « ce compte a-t-il été configuré ? » peut être posée une fois
 * pour toutes. Sans ce garde, un nouveau compte arrive sur un tableau de bord
 * vide qui ne sait rien lui proposer.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profil = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { onboardingTermineLe: true },
  });
  if (!profil?.onboardingTermineLe) redirect("/bienvenue");

  return (
    <>
      <ServiceWorkerRegister />
      <OfflineIndicator />
      <main className="pb-20">{children}</main>
      <BottomNav />
      <CoachFAB />
    </>
  );
}
