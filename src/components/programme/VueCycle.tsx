"use client";
import Link from "next/link";
import { useCoach, DeclarerContexte } from "@/components/coach/ContexteCoach";
import { useState } from "react";
import {
  ChevronRight,
  Info,
  Sparkles,
  Wrench,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { libellePilier } from "@/lib/referentiels/libelles";
import {
  LIBELLES_PHASE,
  LIBELLES_FATIGUE,
  LIBELLES_TENDANCE,
} from "@/lib/referentiels/cycle";
import type { VueProgramme } from "@/services/cycle";
import type { EtatSeance } from "@/lib/engine/semaine-programme";

/**
 * Le programme, tel qu'on le comprend en quelques secondes.
 *
 * L'écran affichait un CRUD : le bloc, puis chaque séance, puis chaque
 * exercice avec ses séries, ses répétitions, son RPE, son tempo et ses repos.
 * Tout y était sauf la réponse à « où j'en suis ».
 *
 * L'ordre est maintenant celui de la lecture : le cycle, la phase, la semaine,
 * les séances, les recommandations, puis seulement les actions. Le détail
 * d'une séance vit derrière un tap — c'est son écran, pas celui-ci.
 *
 * Rien n'est calculé ici. Ce composant met en forme ce que le service a
 * établi, et n'affiche jamais un identifiant du modèle.
 */

/**
 * L'emphase va à ce qui reste à faire, jamais à ce qui est fait.
 *
 * « Aujourd'hui » portait le style le plus appuyé de la liste — encre pleine —
 * alors qu'il désignait une séance DÉJÀ FAITE le jour même. La séance close
 * était donc la plus visible de l'écran, et se lisait comme la consigne du
 * jour ; la prochaine, elle, passait inaperçue. Le libellé le dit maintenant,
 * et l'encre pleine revient à la seule ligne sur laquelle il y a quelque chose
 * à faire.
 */
const ETIQUETTES: Record<EtatSeance, { texte: string; classe: string }> = {
  terminee: { texte: "Terminée", classe: "bg-papier-2 text-encre-2" },
  faite_aujourdhui: {
    texte: "Faite aujourd'hui",
    classe: "bg-papier-2 text-encre-2",
  },
  prochaine: { texte: "Prochaine", classe: "bg-encre text-papier" },
  a_venir: { texte: "À venir", classe: "bg-papier-2 text-encre-3" },
};

function Etiquette({ etat, adaptee }: { etat: EtatSeance; adaptee: boolean }) {
  const e = ETIQUETTES[etat];
  return (
    <>
      <span
        className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${e.classe}`}
      >
        {e.texte}
      </span>
      {/* Deuxième fait, et non deuxième état : une séance peut être faite
          aujourd'hui ET avoir été adaptée. Les deux tenaient dans la même
          alternative, et l'adaptation était perdue le jour même. */}
      {adaptee && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-papier-2 text-encre-3">
          Adaptée
        </span>
      )}
    </>
  );
}

function EtatVide({
  titre,
  texte,
  lien,
  action,
}: {
  titre: string;
  texte: string;
  lien: string;
  action: string;
}) {
  return (
    <div className="rounded-xl border border-filet bg-carte p-5 space-y-3">
      <Sparkles className="w-5 h-5 text-encre-2" aria-hidden />
      <h2 className="text-encre text-xl font-bold">{titre}</h2>
      <p className="text-encre-2 text-sm leading-relaxed">{texte}</p>
      <Link
        href={lien}
        className="block w-full h-11 rounded-xl bg-encre text-papier font-semibold grid place-items-center"
      >
        {action}
      </Link>
    </div>
  );
}

export function VueCycle({ vue }: { vue: VueProgramme }) {
  const [pourquoiOuvert, setPourquoiOuvert] = useState(false);
  const { ouvrir } = useCoach();

  if (!vue.cycle) {
    return (
      <>
        <DeclarerContexte ecran="programme" />
        <EtatVide
          titre="Ton point de départ est prêt"
          texte="Il ne me manque plus qu'un premier bloc pour te proposer des séances. La calibration mesurera tes charges avant de construire quoi que ce soit."
          lien="/dashboard"
          action="Préparer mes séances"
        />
      </>
    );
  }

  const { cycle, lecture, semaine } = vue;
  const enCalibration = vue.etat === "calibration";

  return (
    <div className="programme-v2">
      <DeclarerContexte
        ecran="programme"
        typeEntite="bloc"
        entiteId={cycle.id}
      />

      {/* ---------------------------------------------------------------- */}
      <section className="cycle-panel">
        <div className="cycle-panel-copy">
          <p className="eyebrow">
            Mon programme ·{" "}
            {enCalibration ? "Les fondations" : "Cycle en cours"}
          </p>
          <h2>{cycle.libelle.libelle}</h2>
          {cycle.nom !== cycle.libelle.libelle && (
            <p className="text-encre-3 text-sm">{cycle.nom}</p>
          )}
          {cycle.libelle.intention && (
            <p className="cycle-intention">{cycle.libelle.intention}</p>
          )}
          {enCalibration ? (
            <p className="cycle-detail">
              {cycle.seancesFaites} séance{cycle.seancesFaites > 1 ? "s" : ""}{" "}
              de calibration
              {semaine.length > 0 && (
                <> · {semaine.length} prévues dans ta semaine type</>
              )}
            </p>
          ) : (
            <p className="cycle-detail">
              Semaine {cycle.position.semaine}
              {cycle.position.semainesTotal !== null && (
                <> sur {cycle.position.semainesTotal}</>
              )}
            </p>
          )}
          {cycle.libelle.herite && (
            <p className="text-encre-3 text-xs">
              L’intitulé de ton ancien cycle est conservé.
            </p>
          )}
        </div>
        <div className="cycle-visual">
          <div className="cycle-ring">
            <span>
              {enCalibration ? cycle.seancesFaites : cycle.position.semaine}
            </span>
            <small>
              {enCalibration ? "séances mesurées" : "semaine en cours"}
            </small>
          </div>
          {!enCalibration && cycle.position.avancement !== null && (
            <progress
              className="cycle-progress"
              value={cycle.position.avancement}
              max={1}
              aria-label="Avancement du cycle"
            />
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {lecture && !enCalibration && (
        <section className="space-y-2">
          <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
            Phase actuelle
          </h2>
          <div className="rounded-xl border border-filet bg-carte p-4 space-y-2">
            <p className="text-encre font-semibold">
              {LIBELLES_PHASE[lecture.phase] ?? "Phase en cours"}
            </p>
            <p className="text-encre-2 text-sm">
              {LIBELLES_FATIGUE[lecture.statutFatigue] ?? ""} ·{" "}
              {LIBELLES_TENDANCE[lecture.tendancePerformance] ?? ""}.
            </p>

            {lecture.motifs.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setPourquoiOuvert((o) => !o)}
                  aria-expanded={pourquoiOuvert}
                  className="text-encre-2 text-sm underline underline-offset-2"
                >
                  {pourquoiOuvert ? "Masquer" : "Voir pourquoi"}
                </button>
                {pourquoiOuvert && (
                  <ul className="text-encre-2 text-sm space-y-1 pt-1">
                    {lecture.motifs.map((m) => (
                      <li key={m} className="flex gap-2">
                        <Info
                          className="w-3.5 h-3.5 shrink-0 mt-0.5 text-encre-3"
                          aria-hidden
                        />
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
          Cette semaine
        </h2>

        {semaine.length === 0 ? (
          <p className="text-encre-2 text-sm rounded-xl border border-filet bg-carte p-4">
            Ce cycle n&apos;a pas encore de séances. Ajoute-les depuis
            l&apos;édition avancée, ou demande-les au coach.
          </p>
        ) : (
          <ul className="session-path">
            {semaine.map((s, index) => (
              <li key={s.templateId} className={`path-step path-${s.etat}`}>
                <Link
                  href={`/sessions/new/${s.templateId}`}
                  /* Même raison que la liste des séances : ces cibles
                     construisent un plan complet. On ne les anticipe pas. */
                  prefetch={false}
                  className="path-link"
                >
                  <span className="path-marker" aria-hidden>
                    {s.etat === "terminee" || s.etat === "faite_aujourdhui" ? (
                      <Check size={21} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-encre text-sm font-medium truncate">
                        {s.nom}
                      </span>
                      <Etiquette etat={s.etat} adaptee={s.adaptee} />
                    </span>
                    <span className="block text-encre-3 text-xs mt-0.5">
                      {s.piliers.length > 0 && (
                        <>{s.piliers.map(libellePilier).join(" · ")} — </>
                      )}
                      <span className="chiffres">{s.exercices}</span> exercices
                      · ~
                      <span className="chiffres">{s.dureeEstimeeMinutes}</span>{" "}
                      min
                    </span>
                  </span>
                  <ArrowUpRight
                    className="w-5 h-5 text-encre-3 shrink-0"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* Le modèle ne porte pas de jour de séance : l'ordre est le seul
            repère honnête, et aucune séance ne peut être dite « manquée ». */}
        <p className="text-encre-3 text-xs">
          Ta semaine type, dans l&apos;ordre. Les jours ne sont pas fixés — tu
          t&apos;entraînes quand tu peux.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {vue.dechargeRecommandee && (
        <section className="space-y-2">
          <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
            Ajustement recommandé
          </h2>
          <div className="rounded-xl border border-filet bg-carte p-4 space-y-2">
            <p className="text-encre text-sm font-medium">
              Une décharge se justifierait
            </p>
            <p className="text-encre-2 text-sm leading-snug">
              {lecture?.motifs.slice(0, 2).join(", ") ||
                "Les signaux récents vont dans ce sens"}
              . Rien n&apos;est modifié : c&apos;est à toi de décider.
            </p>
            <button
              type="button"
              onClick={() => ouvrir("decharge")}
              className="block w-full h-11 rounded-xl border border-filet text-encre text-sm font-medium grid place-items-center"
            >
              En parler au coach
            </button>
          </div>
        </section>
      )}

      {vue.ajustements.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
            Ajustement possible
          </h2>
          {vue.ajustements.slice(0, 2).map((a) => (
            <div
              key={a.message}
              className="rounded-xl border border-filet bg-carte p-4 space-y-2"
            >
              <p className="text-encre-2 text-sm leading-snug">{a.message}</p>
              <button
                type="button"
                onClick={() => ouvrir("materiel")}
                className="block w-full h-11 rounded-xl border border-filet text-encre text-sm font-medium grid place-items-center"
              >
                Voir la proposition
              </button>
            </div>
          ))}
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => ouvrir("modifier_programme")}
          className="block w-full h-12 rounded-xl bg-encre text-papier font-semibold grid place-items-center"
        >
          Modifier avec le coach
        </button>
        <p className="text-encre-3 text-xs text-center">
          « Je ne peux plus venir le mercredi », « je veux réduire à 3 séances
          »… Rien n&apos;est appliqué sans ta confirmation.
        </p>
      </section>
    </div>
  );
}

/**
 * L'édition manuelle reste entière, mais cesse d'être la première chose vue.
 * Elle s'adresse à quelqu'un qui sait ce qu'il modifie ; l'écran, lui,
 * s'adresse d'abord à quelqu'un qui veut comprendre.
 */
export function OptionsAvancees({ children }: { children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <section className="pt-2">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="w-full flex items-center justify-between py-3 text-encre-2 text-sm border-t border-filet"
      >
        <span className="flex flex-wrap items-center gap-2">
          <Wrench className="w-4 h-4" aria-hidden />
          Édition avancée
        </span>
        <ChevronRight
          className={`w-4 h-4 transition-transform ${ouvert ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {ouvert && <div className="pt-2">{children}</div>}
    </section>
  );
}
