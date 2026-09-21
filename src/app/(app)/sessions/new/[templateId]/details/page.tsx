import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { lireSeanceProgramme } from "@/services/seance-template";
import { SessionOverview } from "@/components/session-composer/SessionOverview";

export default async function SessionDetailsPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { templateId } = await params;
  const [detail, profile] = await Promise.all([
    lireSeanceProgramme(userId, templateId),
    db.query.users.findFirst({ where: eq(users.id, userId) }),
  ]);

  if (!detail) notFound();

  return <SessionOverview detail={detail} defaultGymId={profile?.prefSalleParDefautId ?? ""} />;
}
