# Mémo GitHub — FuelMapPrice

Petit aide-mémoire pour gérer le projet FuelMapPrice sur GitHub.

---

## 1. Le workflow Git au quotidien

Chaque fois que tu modifies du code (JS, CSS, HTML, Python…) :

```bash
# Étape 1 — Ajouter tous les fichiers modifiés
git add .
# (cette commande est silencieuse, c'est normal !)

# Étape 2 — Créer un commit avec un message
git commit -m "description courte de ce que tu as fait"

# Étape 3 — Envoyer sur GitHub
git push
```

**Les 3 étapes sont obligatoires et dans cet ordre.**
- `git add .` sans `git commit` = rien n'est enregistré
- `git commit` sans `git push` = enregistré en local mais pas sur GitHub
- `git push` sans `git add` + `git commit` = "Everything up-to-date" (rien à envoyer)


## 2. Quand git push râle (rejected)

Ça arrive quand la GitHub Action a committé des données (stations.json, etc.)
pendant que tu travaillais. Le remote est "en avance" sur ton local.

```bash
# 1. Mettre tes modifs de côté
git stash

# 2. Récupérer les commits du remote
git pull --rebase

# 3. Remettre tes modifs par-dessus
git stash pop

# 4. Maintenant le push passe
git push
```

**Astuce** : fais-le systématiquement avant de push si tu as un doute !


## 3. Commandes utiles

```bash
# Voir l'état actuel (fichiers modifiés, ajoutés, etc.)
git status

# Voir l'historique des commits
git log --oneline -10

# Voir ce qui a changé avant de commit
git diff

# Annuler les modifs d'un fichier (ATTENTION : perte définitive)
git checkout -- nom-du-fichier.js
```


## 4. GitHub Actions — le pipeline automatique

Le projet a une Action qui tourne **toutes les heures** (à la minute :07).
Elle exécute `scripts/fetch-data.py` qui :
- Télécharge le flux carburants de data.gouv.fr
- Génère `data/stations.json` (les stations)
- Génère `data/history.json` (les moyennes nationales)
- Génère `data/oil-prices.json` (les cours Brent/WTI)
- Commit et push automatiquement si les données ont changé


## 5. Lancer l'Action manuellement

Parfois tu veux forcer une exécution (par exemple après avoir modifié
`fetch-data.py` ou pour regénérer les données tout de suite).

1. Va sur **github.com/lianazel/FuelMapPrice**
2. Clique sur l'onglet **Actions** (dans la barre du haut)
3. Dans le panneau de gauche, clique sur **"Mise à jour des données sur le carburant"**
4. En haut à droite, clique sur **"Exécuter le flux de travail"**
5. Laisse la branche sur `principal` (main)
6. Clique sur le bouton vert **"Exécuter le flux de travail"**
7. Attends ~12 secondes — un point vert confirme que tout s'est bien passé

**Important** : assure-toi d'avoir pushé ton code AVANT de lancer l'Action,
sinon elle exécutera l'ancienne version du script.


## 6. Conventions de messages de commit

On utilise le format classique avec un préfixe :

| Préfixe | Usage |
|---------|-------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `style:` | Changement CSS / visuel |
| `docs:` | Documentation |
| `chore:` | Maintenance, nettoyage |

Exemples :
- `feat: ajout du toast de bienvenue`
- `fix: double bouton itinéraire sur iOS`
- `style: couleurs du mode sombre`
- `chore: mise à jour du changelog`


## 7. Les fichiers spéciaux du projet

| Fichier | Rôle |
|---------|------|
| `.gitignore` | Liste des fichiers que Git doit ignorer (node_modules, .docx…) |
| `.github/workflows/update-data.yml` | Configuration de la GitHub Action |
| `CHANGELOG.md` | Historique de toutes les versions |
| `data/*.json` | Générés par l'Action — ne PAS les modifier à la main |


## 8. En cas de panique

```bash
# "J'ai tout cassé, je veux revenir au dernier commit"
git checkout -- .

# "J'ai committé un truc que je voulais pas"
git reset --soft HEAD~1
# (ça annule le dernier commit mais garde tes fichiers modifiés)

# "Je veux voir ce qu'il y a sur GitHub sans toucher à mon code"
git fetch
git log origin/main --oneline -5
```

---

*Dernière mise à jour : 9 mai 2026 — FuelMapPrice v1.5.0*
