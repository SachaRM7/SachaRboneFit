import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { lireSeanceProgramme, machinesPourProgramme } from "@/services/seance-template";
import { SessionEditor } from "@/components/session-composer/SessionEditor";

export default async function SessionEditPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { templateId } = await params;
  const [detail, machines] = await Promise.all([
    lireSeanceProgramme(userId, templateId),
    machinesPourProgramme(),
  ]);

  if (!detail) notFound();

  return <SessionEditor detail={detail} machines={machines} />;
}
