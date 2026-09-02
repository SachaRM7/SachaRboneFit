"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
 * ENREGISTREMENT — la politique, et pourquoi celle-là.
 *
 * Un réglage n'est pas une donnée de séance, c'est un souvenir d'appareil : il
 * vaut indépendamment de ce qui sera soulevé ensuite, et il ne doit pas
 * dépendre d'un bouton qu'on oublie de toucher. Régler le siège puis fermer la
 * feuille d'un revers de pouce — le geste le plus naturel en salle — ne perdait
 * rien à la clôture de séance mais perdait tout à la fermeture de l'écran.
 *
 *   réglages   enregistrés à la SORTIE DU CHAMP (blur), et au changement pour
 *              une liste déroulante. Un champ que l'on quitte est un champ dont
 *              on a fini de décider ; la frappe, elle, n'appelle jamais le
 *              réseau. Une valeur refusée par la validation locale n'est pas
 *              envoyée du tout — le champ garde la saisie et affiche pourquoi.
 *
 *   note       enregistrée à la sortie du champ également, et au plus tard à la
 *              fermeture de la feuille. Un texte libre n'a pas d'état « valide
 *              ou non » : rien ne justifierait de le refuser, donc rien ne
 *              justifie non plus de le faire attendre un bouton.
 *
 * Le serveur reste l'autorité : il revalide tout, et c'est sa réponse qui
 * remplace l'état affiché. La validation locale ne fait qu'éviter un
 * aller-retour pour une erreur qu'on sait déjà.
 *
 * Il n'y a donc plus de bouton « Enregistrer » — un bouton qui ne décide de
 * rien apprend à ne pas le toucher, et ce jour-là quelque chose se perd.
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
  const [enregistre, setEnregistre] = useState(false);
  const [expliqueTempo, setExpliqueTempo] = useState(false);

  /**
   * L'état courant, lisible depuis le démontage.
   *
   * La fermeture enregistre la note si elle a changé, et l'effet de nettoyage
   * ne voit que la première valeur capturée s'il lit la variable d'état. La
   * référence, elle, suit.
   */
  const noteRef = useRef(note);
  noteRef.current = note;
  const noteEnBase = useRef(contexte.note ?? "");

  const f = contexte.fiche;

  /**
   * Envoie une modification. Le corps ne porte QUE ce qui a changé : envoyer
   * tout le lot à chaque champ ferait rejeter l'ensemble pour une erreur
   * ailleurs, alors que la personne vient de corriger celui-ci.
   */
  const envoyer = useCallback(async (corps: Record<string, unknown>) => {
    setEnCours(true);
    setErreur(null);
    try {
      const cible = contexte.exerciseInstanceId ?? "sans-appareil";
      const res = await fetch(`/api/execution/${cible}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...corps, exerciseId: contexte.exerciseId }),
      });
      const reponse = await res.json();
      if (!res.ok) {
        setErreur(reponse.error ?? "Enregistrement impossible");
        if (reponse.cle) setRefus((r) => ({ ...r, [reponse.cle]: reponse.error }));
        return false;
      }
      // Le serveur fait autorité : c'est SA lecture qui remplace l'affichage.
      onEnregistre({
        ...contexte,
        reglages: reponse.reglages ?? contexte.reglages,
        note: reponse.note !== undefined ? reponse.note : contexte.note,
      });
      setEnregistre(true);
      return true;
    } catch {
      setErreur("Enregistrement impossible");
      return false;
    } finally {
      setEnCours(false);
    }
  }, [contexte, onEnregistre]);

  /**
   * Validation à la frappe : dire « entre 1 et 10 » tout de suite évite
   * d'attendre le serveur pour apprendre qu'on s'est trompé. Aucun appel
   * réseau ici — la frappe ne parle jamais à l'API.
   */
  const saisir = (cle: string, valeur: string) => {
    setBrouillon((b) => ({ ...b, [cle]: valeur }));
    setEnregistre(false);
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

  /**
   * Quitter un champ, c'est avoir fini de décider : on enregistre.
   *
   * Trois cas volontairement distincts. Inchangé : rien n'est envoyé, le réseau
   * ne sert à rien. Invalide : rien n'est envoyé non plus — une valeur refusée
   * ne doit jamais atteindre la base, et le message reste sous le champ. Vide :
   * envoyé, parce que c'est ainsi qu'on efface un réglage.
   */
  const quitterLeChamp = (cle: string) => {
    const valeur = brouillon[cle] ?? "";
    const enBase = contexte.reglages.find((r) => r.cle === cle)?.valeur ?? "";
    if (valeur === enBase) return;
    if (refus[cle]) return;
    void envoyer({ reglages: { [cle]: valeur } });
  };

  const quitterLaNote = () => {
    if (noteRef.current === noteEnBase.current) return;
    noteEnBase.current = noteRef.current;
    void envoyer({ note: noteRef.current });
  };

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      quitterLaNote();
      onFermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
    // `quitterLaNote` lit des références, pas de l'état : la réinscrire à
    // chaque frappe n'apporterait rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFermer]);

  // Filet de sécurité : fermer sans quitter le champ de note enregistre quand
  // même. Les réglages, eux, sont déjà partis au blur.
  useEffect(() => () => {
    if (noteRef.current !== noteEnBase.current) {
      const cible = contexte.exerciseInstanceId ?? "sans-appareil";
      // `keepalive` : la requête survit au démontage, et même à la fermeture
      // de l'onglet — c'est précisément le cas qu'on refuse de perdre.
      void fetch(`/api/execution/${cible}`, {
        method: "PATCH",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: noteRef.current, exerciseId: contexte.exerciseId }),
      }).catch(() => {});
    }
  }, [contexte.exerciseInstanceId, contexte.exerciseId]);


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Détail : ${nom}`}
      className="fixed inset-0 z-50 bg-encre/40 flex items-end"
      onClick={() => { quitterLaNote(); onFermer(); }}
    >
      <div
        className="w-full max-h-[92vh] bg-papier rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-filet shrink-0">
          <h2 className="font-semibold text-encre truncate pr-3">{nom}</h2>
          <button
            type="button" onClick={() => { quitterLaNote(); onFermer(); }} aria-label="Fermer"
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
                        onChange={(e) => { saisir(r.cle, e.target.value); }}
                        onBlur={() => quitterLeChamp(r.cle)}
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
                        onBlur={() => quitterLeChamp(r.cle)}
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
              onChange={(e) => { setNote(e.target.value); setEnregistre(false); }}
              onBlur={quitterLaNote}
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
        {/* Rien à valider : tout est déjà enregistré. Le pied dit seulement
            où on en est, et referme. */}
        <div className="shrink-0 px-4 pb-8 pt-3 border-t border-filet">
          <p aria-live="polite" className="text-xs text-encre-3 mb-2 h-4">
            {enCours ? "Enregistrement…" : enregistre ? "Enregistré" : ""}
          </p>
          <button
            type="button"
            onClick={() => { quitterLaNote(); onFermer(); }}
            className="w-full h-12 rounded-xl bg-encre text-papier font-medium"
          >
            Fermer
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
