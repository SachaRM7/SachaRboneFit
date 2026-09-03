import { redirect } from "next/navigation";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { db } from "@/db/client";
import { bodyWeights } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { ProfilForm } from "@/components/profil/ProfilForm";
import {
  LIBELLES_MANQUANT, POURQUOI, champsManquants, meriteUnRappel,
} from "@/lib/engine/profil-complet";

export default async function ProfilPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  /**
   * Le poids ne se lit pas dans `users` : sa source est la courbe des pesées.
   * On ne demande donc pas sa valeur, seulement s'il en existe une.
   */
  const [user, pesee] = await Promise.all([
    db.query.users.findFirst({ where: (u, { eq: egal }) => egal(u.id, userId) }),
    db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, userId),
      columns: { id: true },
    }),
  ]);

  if (!user) redirect("/login");

  /**
   * Ce que l'application ne sait pas encore — dit, jamais imposé.
   *
   * Les comptes créés avant que ces questions existent n'ont jamais été
   * interrogés. Les renvoyer vers l'onboarding interromprait quelqu'un qui
   * ouvre l'application pour lancer sa séance ; le profil le signale ici, et
   * l'application continue de fonctionner sans.
   */
  const manquants = champsManquants({
    dateNaissance: user.dateNaissance,
    sexe: user.sexe,
    taille: user.taille,
    aUnePesee: Boolean(pesee),
    frequenceMinParSemaine: user.frequenceMinParSemaine,
    frequenceCibleParSemaine: user.frequenceCibleParSemaine,
    frequenceMaxParSemaine: user.frequenceMaxParSemaine,
    dureeSeanceCibleMinutes: user.dureeSeanceCibleMinutes,
    dureeSeanceMaxMinutes: user.dureeSeanceMaxMinutes,
  });

  return (
    <div className="p-4 space-y-6">
      <EnTeteSecondaire titre="Profil" vers="/settings" libelleRetour="Retour à Plus" />
      <p className="text-encre-3 text-sm">
        Ces informations orientent les séances proposées.
      </p>

      {meriteUnRappel(manquants) && (
        <section className="rounded-xl border border-filet bg-carte p-4 space-y-2">
          <h2 className="text-encre text-sm font-semibold">
            Il me manque {manquants.length === 1 ? "une information" : `${manquants.length} informations`}
          </h2>
          <ul className="space-y-1.5">
            {manquants.map((champ) => (
              <li key={champ} className="text-sm">
                <span className="text-encre-2">{LIBELLES_MANQUANT[champ]}</span>
                <span className="text-encre-3"> — {POURQUOI[champ]}</span>
              </li>
            ))}
          </ul>
          {/* Aucun bouton : les champs sont juste en dessous. Un lien vers un
              formulaire déjà à l'écran ne ferait que déplacer la question. */}
          <p className="text-encre-3 text-xs">
            Rien n&apos;est obligatoire — tout marche sans, plus grossièrement.
          </p>
        </section>
      )}

      <ProfilForm
        initial={{
          nom: user.nom,
          dateNaissance: user.dateNaissance,
          sexe: user.sexe,
          taille: user.taille,
          phaseNutritionnelle: user.phaseNutritionnelle,
          objectifType: user.objectifType,
          objectifMusclesPrioritaires: user.objectifMusclesPrioritaires ?? [],
          objectifChiffre: user.objectifChiffre,
          dateCible: user.dateCible,
          frequenceMinParSemaine: user.frequenceMinParSemaine,
          frequenceCibleParSemaine: user.frequenceCibleParSemaine,
          frequenceMaxParSemaine: user.frequenceMaxParSemaine,
          dureeSeanceCibleMinutes: user.dureeSeanceCibleMinutes,
          dureeSeanceMaxMinutes: user.dureeSeanceMaxMinutes,
        }}
      />
    </div>
  );
}
