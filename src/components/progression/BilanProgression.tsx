"use client";
import Link from "next/link";
import { Trophy, TrendingUp, TrendingDown, Minus, CalendarCheck, HelpCircle, Sparkles } from "lucide-react";
import { LIBELLES as LIBELLES_MUSCLES } from "@/lib/referentiels/muscles";
import type { Bilan } from "@/lib/engine/bilan-progression";

/**
 * Ce qui évolue, dès l'ouverture.
 *
 * L'écran précédent demandait de choisir un exercice avant de montrer quoi que
 * ce soit, dans un sélecteur que rien ne remplissait. Celui-ci raconte d'abord,
 * et laisse creuser ensuite.
 *
 * Rien ici ne calcule : le moteur a déjà décidé de ce qui était interprétable.
 * Quand une grandeur vaut `null`, ce n'est pas un zéro à afficher — c'est une
 * phrase à dire sur ce qui manque encore.
 */

const nomMuscle = (m: string) => (LIBELLES_MUSCLES as Record<string, string>)[m] ?? m;

/**
 * Les nombres s'écrivent en français.
 *
 * « 24180 kg » et « +25.4 % » sont des sorties de `toString()`, pas des
 * chiffres lisibles : le tonnage se lit par tranches de trois, et la virgule
 * décimale n'est pas un point. Le reste de l'application le fait déjà
 * (`Delta`, l'historique) ; cet écran ne le faisait pas.
 */
const nombre = (n: number, decimales = 0) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimales });

const pluriel = (n: number, singulier: string, pluriel_ = `${singulier}s`) =>
  n > 1 ? pluriel_ : singulier;

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">{titre}</h2>
      {children}
    </section>
  );
}

/** Le chiffre qu'on lit en premier, avec ce qu'il compte juste dessous. */
function Chiffre({ valeur, unite, legende }: { valeur: string; unite?: string; legende: string }) {
  return (
    <div className="flex-1 rounded-xl border border-filet bg-carte px-3 py-3">
      <p className="text-encre text-2xl font-bold leading-none chiffres">
        {valeur}
        {unite && <span className="text-encre-2 text-sm font-normal ml-1">{unite}</span>}
      </p>
      <p className="text-encre-2 text-xs mt-1.5 leading-snug">{legende}</p>
    </div>
  );
}

function EtatVide() {
  return (
    <div className="rounded-xl border border-filet bg-carte p-5 space-y-3">
      <Sparkles className="w-5 h-5 text-encre-2" aria-hidden />
      <h2 className="text-encre text-xl font-bold">Rien à comparer, pour l&apos;instant</h2>
      <p className="text-encre-2 text-sm leading-relaxed">
        Ta première séance ne sera pas une performance : elle posera tes références. C&apos;est à
        partir d&apos;elles que tout se mesurera ensuite — tes charges, tes records, tes tendances.
      </p>
      <Link
        href="/dashboard"
        className="block w-full h-11 rounded-xl bg-encre text-papier font-semibold grid place-items-center"
      >
        Faire ma première séance
      </Link>
    </div>
  );
}

export function BilanProgression({ bilan }: { bilan: Bilan }) {
  if (bilan.etat === "sans_donnees") return <EtatVide />;

  const { adherence, volume } = bilan;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      <div className="flex gap-2">
        <Chiffre
          valeur={String(bilan.seancesTotal)}
          legende={`${pluriel(bilan.seancesTotal, "séance")} depuis le début`}
        />
        {bilan.seancesDerniereSemaine !== null && (
          <Chiffre
            valeur={String(bilan.seancesDerniereSemaine)}
            legende="la semaine dernière"
          />
        )}
        {bilan.dureeMedianeMinutes !== null && (
          <Chiffre
            valeur={String(bilan.dureeMedianeMinutes)}
            unite="min"
            legende="durée habituelle"
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {adherence && (
        <Bloc titre="Ton rythme">
          <div className="rounded-xl border border-filet bg-carte p-4 space-y-3">
            <div className="flex items-baseline gap-2">
              <CalendarCheck className="w-4 h-4 text-encre-2 shrink-0" aria-hidden />
              <p className="text-encre text-sm">
                <span className="chiffres font-semibold">{adherence.semainesTenues}</span> semaine
                {adherence.semainesTenues > 1 ? "s" : ""} sur{" "}
                <span className="chiffres font-semibold">{adherence.semainesObservees}</span> à ton
                minimum ou au-dessus.
              </p>
            </div>

            {/* Une colonne par semaine révolue : la forme de l'assiduité se lit
                mieux qu'un pourcentage, et une coupure reste visible. Les
                colonnes sont étroites et posées sur une ligne de base — pleine
                largeur, quatre semaines devenaient quatre pavés illisibles. */}
            <div className="flex items-end gap-3 h-14 border-b border-encre/15 pb-px" aria-hidden>
              {adherence.seancesParSemaine.map((n, i) => {
                const plafond = Math.max(adherence.max, ...adherence.seancesParSemaine, 1);
                return (
                  <div key={i} className="w-7 flex flex-col justify-end h-full gap-1">
                    <span className="text-encre-3 text-[10px] text-center chiffres leading-none">
                      {n}
                    </span>
                    <div
                      className={`w-full rounded-t-sm ${n >= adherence.min ? "bg-encre" : "bg-filet"}`}
                      style={{ height: `${Math.max(4, (n / plafond) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-encre-3 text-xs">
              Séances par semaine, la plus ancienne à gauche — ta fourchette va de{" "}
              <span className="chiffres">{adherence.min}</span> à{" "}
              <span className="chiffres">{adherence.max}</span>.
            </p>

            {adherence.statut === "sous_le_minimum" && (
              <p className="text-encre-2 text-sm leading-snug border-l-2 border-filet pl-3">
                En dessous de ton minimum. Ce n&apos;est pas un reproche : si la fourchette ne
                correspond plus à ta vie, elle peut se changer.
              </p>
            )}
          </div>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {volume && (
        <Bloc titre="Volume">
          <div className="rounded-xl border border-filet bg-carte p-4">
            <div className="flex items-center gap-2">
              {!volume.significative ? (
                <Minus className="w-4 h-4 text-encre-2 shrink-0" aria-hidden />
              ) : volume.variationPct > 0 ? (
                <TrendingUp className="w-4 h-4 text-gain shrink-0" aria-hidden />
              ) : (
                <TrendingDown className="w-4 h-4 text-encre-2 shrink-0" aria-hidden />
              )}
              <p className="text-encre text-sm">
                <span className="chiffres font-semibold">{volume.seriesDerniereSemaine}</span> séries
                la semaine dernière
                {volume.significative && (
                  <>
                    {" "}
                    <span className={volume.variationPct > 0 ? "text-gain" : "text-encre-2"}>
                      {volume.variationPct > 0 ? "+" : ""}
                      <span className="chiffres">{nombre(volume.variationPct, 1)}</span> %
                    </span>
                  </>
                )}
              </p>
            </div>
            <p className="text-encre-3 text-xs mt-1.5">
              Contre <span className="chiffres">{nombre(volume.seriesMoyenneAnterieure, 1)}</span>{" "}
              en moyenne sur les <span className="chiffres">{volume.semainesComparees - 1}</span>{" "}
              semaines précédentes · <span className="chiffres">{nombre(volume.tonnageDerniereSemaine)}</span>{" "}
              kg soulevés.
            </p>
            {!volume.significative && (
              <p className="text-encre-3 text-xs mt-1">
                Écart trop faible pour parler de tendance.
              </p>
            )}
          </div>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {bilan.recordsRecents.length > 0 && (
        <Bloc titre="Records franchis">
          <ul className="space-y-2">
            {bilan.recordsRecents.slice(0, 4).map((r) => (
              <li
                key={`${r.exerciseInstanceId}-${r.date}-${r.plage}`}
                className="rounded-xl border border-filet bg-carte px-4 py-3 flex items-center gap-3"
              >
                <Trophy className="w-4 h-4 text-gain shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-encre text-sm font-medium truncate">{r.exerciceNom}</p>
                  <p className="text-encre-2 text-xs">
                    <span className="chiffres">{nombre(r.charge, 1)}</span> kg ×{" "}
                    <span className="chiffres">{r.reps}</span> — meilleure charge à{" "}
                    <span className="chiffres">{r.plage}</span> répétitions ou plus
                  </p>
                </div>
                <span className="text-gain text-sm font-semibold chiffres shrink-0">
                  +{nombre(r.progressionPct, 1)} %
                </span>
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {bilan.enProgression.length > 0 && (
        <Bloc titre="Ce qui progresse">
          <ul className="rounded-xl border border-filet bg-carte divide-y divide-filet">
            {bilan.enProgression.slice(0, 5).map((e) => (
              <li key={e.exerciseInstanceId} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-encre text-sm font-medium truncate">{e.exerciceNom}</p>
                  <p className="text-encre-3 text-xs">
                    <span className="chiffres">{e.seances}</span> séances mesurées
                  </p>
                </div>
                <span className="text-gain text-sm font-semibold chiffres shrink-0">
                  +{nombre(e.progressionPct, 1)} %
                </span>
              </li>
            ))}
          </ul>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {bilan.musclesDeLaPeriode.length > 0 && (
        <Bloc titre="Ce que tu travailles">
          <div className="rounded-xl border border-filet bg-carte p-4 space-y-2">
            {bilan.musclesDeLaPeriode.slice(0, 6).map((m) => {
              const maximum = bilan.musclesDeLaPeriode[0]!.series;
              return (
                <div key={m.muscle} className="flex items-center gap-3">
                  <span className="text-encre-2 text-xs w-28 shrink-0 truncate">
                    {nomMuscle(m.muscle)}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-papier-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-encre"
                      style={{ width: `${Math.max(4, (m.series / maximum) * 100)}%` }}
                    />
                  </div>
                  <span className="text-encre-3 text-xs chiffres w-10 text-right shrink-0">
                    {nombre(m.series, 1)}
                  </span>
                </div>
              );
            })}
            <p className="text-encre-3 text-xs pt-1">
              Séries depuis le début. Un muscle secondaire compte pour une demi-série.
            </p>
          </div>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {bilan.stagnations.length > 0 && (
        <Bloc titre="À regarder">
          <ul className="space-y-2">
            {bilan.stagnations.slice(0, 3).map((s) => (
              <li key={s.exerciseInstanceId} className="rounded-xl border border-filet bg-carte px-4 py-3">
                <p className="text-encre text-sm font-medium">{s.exerciceNom}</p>
                <p className="text-encre-2 text-xs mt-0.5">
                  <span className="chiffres">{s.seances}</span> séances depuis ton dernier record,
                  sur <span className="chiffres">{s.semaines}</span> semaines.
                </p>
              </li>
            ))}
          </ul>
          <p className="text-encre-3 text-xs">
            Seuls les exercices réellement retentés depuis leur record figurent ici : les semaines
            où l&apos;exercice n&apos;a pas pu être proposé ne comptent pas.
          </p>
        </Bloc>
      )}

      {/* ------------------------------------------------------------------ */}
      {bilan.enAttente.length > 0 && (
        <div className="rounded-xl border border-filet bg-carte p-4 space-y-1.5">
          {bilan.enAttente.map((phrase) => (
            <p key={phrase} className="text-encre-2 text-sm flex gap-2 leading-snug">
              <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-encre-3" aria-hidden />
              {phrase}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
