import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { loadCoachContext } from "@/lib/coach/context-loader";
import { contexteValide } from "@/lib/coach/contexte-ecran";
import { resoudreContexte } from "@/services/contexte-coach";
import { suggestionsVerifiees } from "@/lib/coach/accueil-conversation";
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    const [profil, ecran] = await Promise.all([
      loadCoachContext(userId),
      resoudreContexte(userId, contexteValide(body?.contexte) ?? { ecran: "accueil" }),
    ]);
    return NextResponse.json({
      repere: ecran.texte?.split("\n").find((ligne) => ligne.startsWith("Exercice regardé")) ?? (profil.blocActif ? `${profil.blocActif.nom} · semaine ${profil.blocActif.semaine}` : null),
      suggestions: suggestionsVerifiees({ seance: Boolean(ecran.refs?.seanceTemplateId || ecran.refs?.sessionLogId),
        historique: profil.last5Sessions.length > 0, programme: Boolean(profil.blocActif), exercice: Boolean(ecran.refs?.exerciseInstanceId) }),
    });
  } catch { return NextResponse.json({ error: "Contexte indisponible" }, { status: 503 }); }
}
