"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  messageDeRefus, PHASES_TEMPO, validerReglage,
  type ContexteExecutionClient,
} from "./execution-client";

interface Props {
  contexte: ContexteExecutionClient;
  nom: string;
  onFermer: () => void;
  onEnregistre: (maj: ContexteExecutionClient) => void;
}

/**
 * Le détail : ce qu'on ouvre quand on a un doute, pas ce qu'on lit à chaque série.
 *
 * La carte de séance porte le strict nécessaire — nom, illustration, séries,
 * tempo, résumé des réglages. Tout le reste vit ici, à un geste de distance :
 * technique, erreurs, respiration, réglages détaillés, note.
 *
 * Une feuille qui monte du bas plutôt qu'une modale centrée : le pouce est en
 * bas de l'écran, et les actions doivent y rester atteignables quand le clavier
 * s'ouvre. Les sections absentes ne s'affichent pas du tout — ni titre vide, ni
 * « non renseigné » décoratif. Ce qui manque se voit à l'endroit où on peut le
 * renseigner, c'est-à-dire dans les réglages.
 */
export function FicheExecution({ contexte, nom, onFermer, onEnregistre }: Props) {
  const [brouillon, setBrouillon] = useState<Record<string, string>>(
    Object.fromEntries(contexte.reglages.map((r) => [r.cle, r.valeur ?? ""])),
  );
  const [note, setNote] = useState(contexte.note ?? "");
  const [refus, setRefus] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [expliqueTempo, setExpliqueTempo] = useState(false);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  const f = contexte.fiche;

  /**
   * Validation avant l'aller-retour réseau : dire « entre 1 et 10 » à la
   * frappe évite d'attendre le serveur pour apprendre qu'on s'est trompé. Le
   * serveur revalide malgré tout — c'est lui qui fait autorité.
   */
  const saisir = (cle: string, valeur: string) => {
    setBrouillon((b) => ({ ...b, [cle]: valeur }));
    const definition = contexte.reglages.find((r) => r.cle === cle)?.definition;
    if (valeur.trim() === "") {
      setRefus((r) => ({ ...r, [cle]: "" }));
      return;
    }
    const verdict = validerReglage(definition, valeur);
    setRefus((r) => ({
      ...r,
      [cle]: verdict.valide ? "" : messageDeRefus(verdict.refus!, definition),
    }));
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const cible = contexte.exerciseInstanceId ?? "sans-appareil";
      const res = await fetch(`/api/execution/${cible}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reglages: contexte.exerciseInstanceId ? brouillon : undefined,
          note,
          exerciseId: contexte.exerciseId,
        }),
      });
      const corps = await res.json();
      if (!res.ok) {
        setErreur(corps.error ?? "Enregistrement impossible");
        if (corps.cle) setRefus((r) => ({ ...r, [corps.cle]: corps.error }));
        return;
      }
      onEnregistre({
        ...contexte,
        reglages: corps.reglages ?? contexte.reglages,
        note: corps.note ?? null,
      });
      onFermer();
    } catch {
      setErreur("Enregistrement impossible");
    } finally {
      setEnCours(false);
    }
  };

  const bloquant = Object.values(refus).some(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Détail : ${nom}`}
      className="fixed inset-0 z-50 bg-encre/40 flex items-end"
      onClick={onFermer}
    >
      <div
        className="w-full max-h-[92vh] bg-papier rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-filet shrink-0">
          <h2 className="font-semibold text-encre truncate pr-3">{nom}</h2>
          <button
            type="button" onClick={onFermer} aria-label="Fermer"
            className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-encre-2"
          >
            <X className="w-6 h-6" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {contexte.tempo && (
            <section>
              <button
                type="button"
                onClick={() => setExpliqueTempo((v) => !v)}
                aria-expanded={expliqueTempo}
                className="text-left w-full"
              >
                <h3 className="text-xs uppercase tracking-wide text-encre-3">Tempo</h3>
                <p className="chiffres text-encre tabular-nums">
                  {contexte.tempo.brut}
                  <span className="text-encre-3 text-xs ml-2 underline underline-offset-4">
                    {expliqueTempo ? "masquer" : "que veut dire ce nombre ?"}
                  </span>
                </p>
              </button>
              {expliqueTempo && (
                <ul className="mt-2 space-y-1">
                  {PHASES_TEMPO.map((p, i) => (
                    <li key={p.cle} className="text-sm text-encre-2 flex gap-2">
                      <span className="chiffres tabular-nums w-4 shrink-0 text-encre">
                        {contexte.tempo!.brut.split("-")[i]}
                      </span>
                      <span>{p.explication}</span>
                    </li>
                  ))}
                  <li className="text-xs text-encre-3 pt-1">
                    {contexte.tempo.origine === "seance" ? "Prescrit pour aujourd'hui."
                      : contexte.tempo.origine === "programme" ? "Prescrit par ton programme."
                      : "Tempo propre à ce mouvement."}
                  </li>
                </ul>
              )}
            </section>
          )}

          {contexte.reglages.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-encre-3 mb-2">
                Réglages de cet appareil
              </h3>
              <div className="space-y-3">
                {contexte.reglages.map((r) => (
                  <div key={r.cle}>
                    <label htmlFor={`r-${r.cle}`} className="block text-sm text-encre-2 mb-1">
                      {r.libelle}
                      {r.definition.type === "cran" && r.definition.min != null && r.definition.max != null && (
                        <span className="text-encre-3 text-xs ml-1">
                          ({r.definition.min}–{r.definition.max})
                        </span>
                      )}
                    </label>
                    {r.definition.type === "choix" ? (
                      <select
                        id={`r-${r.cle}`}
                        value={brouillon[r.cle] ?? ""}
                        onChange={(e) => saisir(r.cle, e.target.value)}
                        className="w-full h-12 rounded-xl border border-filet bg-carte px-3 text-encre"
                      >
                        <option value="">Non renseigné</option>
                        {(r.definition.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`r-${r.cle}`}
                        // `decimal` plutôt que `numeric` : le pavé décimal
                        // s'ouvre avec la virgule, que le validateur accepte.
                        inputMode={r.definition.type === "texte" ? "text" : "decimal"}
                        value={brouillon[r.cle] ?? ""}
                        onChange={(e) => saisir(r.cle, e.target.value)}
                        placeholder="Non renseigné"
                        className="w-full h-12 rounded-xl border border-filet bg-carte px-3 text-encre chiffres tabular-nums"
                      />
                    )}
                    {refus[r.cle] && (
                      <p role="alert" className="text-perte text-xs mt-1">{refus[r.cle]}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <label htmlFor="note-exo" className="block text-xs uppercase tracking-wide text-encre-3 mb-2">
              Ma note
            </label>
            <input
              id="note-exo"
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
              placeholder="siège 6 parfait, poignée neutre mieux…"
              className="w-full h-12 rounded-xl border border-filet bg-carte px-3 text-encre"
            />
          </section>

          {f?.description && <Bloc titre="En bref">{f.description}</Bloc>}
          {f?.positionDepart && <Bloc titre="Position de départ">{f.positionDepart}</Bloc>}
          {f?.execution && <Bloc titre="Exécution">{f.execution}</Bloc>}
          {f?.amplitude && <Bloc titre="Amplitude">{f.amplitude}</Bloc>}
          {f?.respiration && <Bloc titre="Respiration">{f.respiration}</Bloc>}

          {f?.pointsCles && f.pointsCles.length > 0 && (
            <Liste titre="Points clés" items={f.pointsCles} />
          )}
          {f?.erreursFrequentes && f.erreursFrequentes.length > 0 && (
            <Liste titre="Erreurs fréquentes" items={f.erreursFrequentes} />
          )}
          {f?.securite && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-perte mb-1">Sécurité</h3>
              <p className="text-sm text-encre-2">{f.securite}</p>
            </section>
          )}
        </div>

        {erreur && (
          <p role="alert" className="px-4 pb-2 text-perte text-sm shrink-0">{erreur}</p>
        )}

        {/* Les actions restent en bas, hors du défilement : le clavier pousse
            le contenu, pas le bouton d'enregistrement. */}
        <div className="shrink-0 px-4 pb-8 pt-3 border-t border-filet">
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || bloquant}
            className="w-full h-12 rounded-xl bg-encre text-papier font-medium disabled:opacity-40"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-encre-3 mb-1">{titre}</h3>
      <p className="text-sm text-encre-2">{children}</p>
    </section>
  );
}

function Liste({ titre, items }: { titre: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-encre-3 mb-1">{titre}</h3>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t} className="text-sm text-encre-2 flex gap-2">
            <span aria-hidden className="text-encre-3">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
