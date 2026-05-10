# Mémo GitHub Actions — Lancer le workflow manuellement

---

## C'est quoi une GitHub Action ?

Une GitHub Action, c'est un petit programme qui tourne automatiquement
sur les serveurs de GitHub à ta place. Tu n'as rien à installer,
rien à configurer sur ton PC — tout se passe "dans le cloud".

Pour FuelMapPrice, l'Action s'appelle **"Mise à jour des données sur le carburant"**.
Elle fait le boulot suivant :

1. Télécharge le flux officiel des prix de carburants (data.gouv.fr)
2. Transforme le XML en fichiers JSON lisibles par l'appli
3. Télécharge les cours du pétrole Brent et WTI
4. Commit et push les fichiers mis à jour dans le dépôt

Elle tourne **automatiquement toutes les heures** (à la minute :07),
mais tu peux aussi la lancer à la main quand tu veux.


## Quand la lancer manuellement ?

- Tu viens de modifier `scripts/fetch-data.py` et tu veux tester tout de suite
- Les données semblent périmées et tu ne veux pas attendre l'heure suivante
- Tu viens d'ajouter un nouveau fichier de données dans le pipeline
- Tu veux juste vérifier que tout fonctionne après un push


## Comment faire — étape par étape

### Étape 1 — Aller sur le dépôt

Ouvre ton navigateur et va sur :
**github.com/lianazel/FuelMapPrice**


### Étape 2 — Onglet Actions

Clique sur l'onglet **"Actes"** (ou **"Actions"** si ton GitHub est en anglais)
dans la barre de navigation en haut du dépôt.


### Étape 3 — Sélectionner le workflow

Dans le panneau de gauche, clique sur :
**"Mise à jour des données sur le carburant"**

Tu arrives sur la liste de toutes les exécutions passées (avec des points verts).


### Étape 4 — Lancer

En haut à droite de la liste, tu vois le bouton :
**"Exécuter le flux de travail"** (ou "Run workflow" en anglais)

1. Clique dessus — un petit menu déroulant s'ouvre
2. Laisse la branche sur **"principal"** (c'est ta branche main)
3. Clique sur le bouton vert **"Exécuter le flux de travail"**


### Étape 5 — Vérifier

- Un nouveau run apparaît en haut de la liste avec un point orange (en cours)
- Après ~12 secondes, il passe au vert = tout est bon
- Si c'est rouge = il y a eu une erreur (clique dessus pour voir les logs)


## Vérifier que ça a marché

Après le point vert, recharge ta page FuelMapPrice dans le navigateur.
Les données devraient être à jour (stations, prix, cours du pétrole).

Tu peux aussi aller voir les fichiers générés directement sur GitHub :
**github.com/lianazel/FuelMapPrice/tree/main/data**


## Le fichier qui contrôle tout ça

La configuration de l'Action est dans :
`.github/workflows/update-data.yml`

C'est un fichier YAML qui dit à GitHub :
- **Quand** lancer (toutes les heures + manuellement)
- **Sur quel système** (Ubuntu Linux)
- **Quoi faire** (installer Python, lancer le script, commit les résultats)

Tu n'as normalement pas besoin d'y toucher, sauf si tu changes
le nom du script Python ou si tu ajoutes un nouveau fichier de données.


## Si ça échoue (point rouge)

Pas de panique ! Clique sur le run en rouge, puis sur **"refresh"**
pour voir les logs. Les causes les plus fréquentes :

- Le site data.gouv.fr est temporairement indisponible (réessaie plus tard)
- Une erreur dans `fetch-data.py` (vérifie ton dernier push)
- Le CSV des cours du pétrole est inaccessible (non bloquant, l'appli marche sans)

---

*Dernière mise à jour : 9 mai 2026*
