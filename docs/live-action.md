# Live — action, aide et explication

Branche : `codex/live-action`, issue du main `d47a773` (Home fusionnée par PR #28).
La refonte Live reste distincte de cette fusion, sans migration ni modification des moteurs de progression.

## Architecture et fichiers

- `LecteurExercice.tsx` : charge/reps dominantes, étape de ressenti distincte, convention toujours près du champ, historique et premier essai repliés, fiche et démonstration conservées.
- `useSaisieSeries.ts`, `sessionStore.ts` : même contrôleur pour Focus/Liste et mêmes actions serveur. Les champs non validés, l'étape de ressenti et le brouillon de bilan utilisent la clé de persistance existante. Aucun nouveau champ en base.
- `DetailsLive.tsx`, `BandeauAdaptation.tsx`, `ObservateurSeance.tsx` : aide accessible en sheet et explications sur demande ; un constat à la fois, effort excessif prioritaire sur les observations utiles, sécurité toujours traitée par les parcours existants.
- `RestTimer.tsx`, `sessions/new/[templateId]/page.tsx` : repos issu de l'horodatage persistant, annonce de la prochaine série et de l'exercice terminé, extension sans remise à zéro.
- `sessions/new/[templateId]/finish/page.tsx`, `ProgressionSummary.tsx`, `SessionDebrief.tsx` : compteurs réels, trois mesures visibles puis détail, énergie/note, résumé du débrief puis texte intégral. Retry, verrou de double clic et restauration avant redirection.
- `SOSMachineOccupee.tsx` : alternatives immédiatement calculées pour l'exercice concerné ; report et choix d'un autre exercice toujours accessibles.
- `live-session.css` : gros chiffres/CTA, aides secondaires, sheets avec safe area et présentation compacte du bilan.
- `api/set-logs/last-session/route.ts`, `services/plan-seance.ts` : exclusion optionnelle de la séance courante pour le bilan. L'autosauvegarde ne peut plus devenir sa propre référence. L'utilisateur authentifié et l'exclusion des archives restent des filtres obligatoires ; les autres appelants gardent leur comportement.
- Tests adaptés : `enchainement-exercices.ctest.tsx`, `serie-validee-reste-visible.ctest.tsx`, `premiere-seance-novice.ctest.tsx`, `mascotte-coach.ctest.tsx`, `live-action.ctest.tsx`, `reference-tronquee.itest.ts`.
- `.github/workflows/live-review.yml` : validations sur GitHub, Postgres jetable sans accès aux identifiants de production.

## Correspondance avec 02_live.md

| Exigence | Réalisation / preuve |
| --- | --- |
| Préparation, intro, série | Parcours existant état du jour -> séance conservé. Focus affiche l'exercice, la série courante, la charge, les répétitions et une action principale. |
| Aide contextuelle | Premier repère, protocole d'essai, historique, tempo, notes et réglages derrière l'aide. Fiche complète et démonstration restent accessibles. |
| Novice / expérimenté | Nouveauté déduite des références existantes ; réserve en langage naturel en calibration, RPE direct dans le parcours avancé. Aucune nouvelle échelle. |
| Ressenti après geste | « J'ai fini ma série » puis choix réel et « Enregistrer la série ». Charge/reps validées avec les validateurs existants. Aucun RIR novice présélectionné. |
| Repos | Timestamp existant, timer dominant, mascotte discrète, prochaine action. Refresh et +30 s testés. |
| Observateur / Pourquoi | Détection inchangée, un constat priorisé, détail factuel au clic puis ouverture volontaire du Coach. Aucun appel IA par le composant d'observation. |
| Exercice suivant | Fin d'exercice et prochaine série annoncées au repos. Avancement, report et lignées de substitutions conservés. |
| Machine occupée | Alternatives du moteur disponibles immédiatement ; report sans perte des séries. |
| Douleur | Zone, intensité, type, moment et résultat de sécurité conservés. Test d'une douleur simulée, distinct d'un remplacement. |
| Fin | Six exercices / douze séries / cinq minutes dans la recette ; trois mesures puis détail ; premiers repères sans faux delta ; énergie et note. |
| Débrief | Extrait court puis analyse complète existante ouvrable/repliable. Le texte IA reste celui du serveur. |
| Sauvegarde | PATCH existant, clear uniquement après succès, retry et double clic testés ; brouillons et bilan repris après refresh. |
| Conventions | Source existante commune Focus/Liste ; charge totale barre comprise et pile vérifiées dans la preview. Assistance et autres conventions couvertes par les suites existantes. |
| Mobile | 320 × 740, 390 × 844 et 430 × 932. Gros contrôles, aucun débordement horizontal constaté à 320 px. État/Temps restent dans le header sticky ; accès vérifiés après défilement en Liste. |

## Recette sur la preview Vercel

Compte `sacha4dev+1`, explicitement autorisé pour les essais. Une séance fictive a été créée et enregistrée : `2cdd68c9-b954-45bc-bc83-09102ccbe7d7`.

Parcours exécuté : préparation -> première série (22,5 kg × 8) -> ressenti non sélectionné -> refresh (brouillon intact) -> choix de réserve 3 -> validation -> repos -> refresh (1:49 restant, sans retour à 2:00) -> démonstration Milieu contrôlable -> seconde série -> exercice suivant -> machine occupée/report -> substitution Lat Pulldown -> douleur simulée -> Liste (séries validées visibles) -> défilement/État/Temps -> retour Focus -> fin des exercices -> retour automatique à l'exercice reporté -> douze séries -> bilan -> note et énergie 7 -> refresh -> sauvegarde serveur -> détail de la séance et débrief.

La séance porte explicitement une note de test fictif. Le Coach a reconnu ce caractère fictif dans son débrief ; aucune conclusion physiologique de cette recette n'est revendiquée.

Deux défauts révélés par cette recette ont été corrigés : comparaison du bilan avec ses propres séries autosauvegardées ; redirection prématurée lors du refresh du bilan. La saisie de note ne relance plus les lectures d'historique à chaque frappe.

## Vérifications distantes

Le workflow lance réellement : lint ; `next typegen` + `tsc --noEmit` ; suite unitaire ; suite composants ; `next build` ; préparation d'une base Postgres jetable ; neuf suites d'intégration Live.

Intégrations : références de progression (dont exclusion de la séance courante et isolation comptes), séries persistées/révisions, démarrage/reprise, lignées après perte du store, fin sans séance fantôme, débrief persistant, douleur/contraintes, symptômes et isolation utilisateurs.

Tests composants ajoutés : timer repris et prolongé ; fin du repos annoncée une fois ; débrief repliable sans POST automatique ; premier repère sans faux delta ; bilan note/énergie restauré ; échec de clôture et retry sans double envoi. Les tests Focus précédents suivent désormais les deux gestes sans retirer leurs assertions de persistance et d'enchaînement.

Résultats finaux : voir le check « Live review » du HEAD de la PR. Les tests ne sont pas exécutés via un serveur local sur D.

## Limites concrètes

- Vérification responsive dans le navigateur de preview, pas sur un iPhone physique : clavier Safari et safe area matérielle restent à éprouver sur appareil.
- La déconnexion réseau est simulée dans le test de sauvegarde ; aucun incident réseau n'a été provoqué sur la base partagée.
- La qualité des consignes dépend des fiches/machines documentées. Le lot conserve les replis honnêtes sans inventer de réglages.
- Le résumé IA est un extrait du débrief enregistré, sans seconde génération ni nouvelle analyse.
- Les séries non encore validées restent locales, dans la persistance existante. Les séries validées utilisent l'autosauvegarde serveur existante.
- Le Live n'est ni fusionné ni promu en production. La Home a été fusionnée auparavant sur demande. Les écritures de recette concernent uniquement le compte de test autorisé ; la preview peut partager la base de production.
