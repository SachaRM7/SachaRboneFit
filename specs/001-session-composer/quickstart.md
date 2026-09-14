# Vérification rapide

## Contrôles locaux

```powershell
rtk npx tsc --noEmit
rtk npm run lint
rtk npm test -- --run
rtk npm run build
```

## Scénarios preview Vercel

1. Ouvrir Séances sur un petit iPhone : « Reprendre » ou la séance prévue reste dominante, « Créer une séance » est immédiatement visible.
2. Créer un brouillon vide, choisir un lieu, ajouter quatre exercices, les réordonner et modifier séries, répétitions, réserve, tempo et repos.
3. Ouvrir le clavier sur chaque champ et vérifier champ actif, CTA, safe area et absence de double scroll.
4. Enregistrer en « Faire aujourd'hui », exécuter le Live et vérifier que la rotation permanente ne change pas.
5. Dupliquer la prochaine séance, choisir « Remplacer », abandonner : la rotation ne change pas. Terminer la séance : elle avance d'un passage.
6. Enregistrer une copie dans le programme et vérifier que les séances précédentes restent intactes.
7. Depuis Coach, demander une alternative complète, vérifier l'aperçu, refuser, puis en demander une autre et l'accepter.
8. Vérifier double tap, erreur réseau, conversation historique et ancien Live.
