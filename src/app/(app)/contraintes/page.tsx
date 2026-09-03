import { redirect } from "next/navigation";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { contraintesPourAffichage } from "@/services/contraintes";
import { ListeContraintes } from "@/components/contraintes/ListeContraintes";

/**
 * Ce que l'athlète ménage en ce moment.
 *
 * Volontairement pauvre : ce n'est pas un dossier médical. Une zone, depuis
 * quand, ce que ça change, et un bouton pour dire que ça va mieux — ce dernier
 * étant le seul qui manquait vraiment, puisque rien ne permettait jusqu'ici de
 * lever une contrainte autrement qu'en SQL.
 */
export default async function Page() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { actives, passees } = await contraintesPourAffichage(userId);

  return (
    <div className="min-h-dvh bg-papier text-encre p-4 space-y-6">
      <EnTeteSecondaire titre="Ce que tu ménages" vers="/settings" libelleRetour="Retour à Plus" />
      <header className="space-y-1">
        <p className="text-encre-3 text-sm">
          {actives.length === 0
            ? "Rien en ce moment. Tu peux signaler une gêne pendant une séance."
            : "Dis-le quand ça va mieux : les exercices concernés redeviennent proposables."}
        </p>
      </header>

      <ListeContraintes actives={actives} passees={passees} />
    </div>
  );
}
