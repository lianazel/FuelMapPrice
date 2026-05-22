# CLAUDE.md — Contexte projet pour Claude Code

## Identité du projet

**FuelMapPrice** — application web statique qui affiche les stations-service françaises les moins chères autour d'une ville de référence. Données officielles data.gouv.fr, hébergée sur GitHub Pages, zéro backend.

- **Repo** : https://github.com/lianazel/FuelMapPrice
- **URL live** : https://lianazel.github.io/FuelMapPrice/
- **Version actuelle** : 1.6.5 (mai 2026)
- **Licence** : MIT

## Organisation de l'équipe

| Rôle | Qui | Ce qu'il fait |
|------|-----|---------------|
| Chef de projet | JC | Donne la direction produit, les idées, valide les livrables |
| Tech Lead / Architecte | Cowork (Claude Opus) | Rédige les prompts techniques détaillés, conseille sur l'architecture et la sécurité |
| Ingénieur d'exécution | Claude Code (toi) | Implémente les modifications dans le code en suivant les prompts reçus |

**Workflow** : JC exprime un besoin → Cowork rédige un prompt technique précis → tu l'exécutes → JC valide.

## Stack technique

| Couche | Technologie | Notes |
|--------|-------------|-------|
| Structure | HTML5 sémantique | Un seul `index.html` |
| Style | Tailwind CSS via Play CDN | Pas de build step, pas de `tailwind.config.js` local |
| Réactivité | Alpine.js (~6 KB) | Composant principal dans `app.js` |
| Carte | Leaflet.js + MarkerCluster | Tuiles OpenStreetMap |
| Graphiques | Chart.js | Onglet Tendances + onglet Géopolitique |
| Géocodage | Nominatim (OSM) | Respecter le rate-limit (1 req/s, debounce 350ms) |
| Données | JSON statique (`data/stations.json`, `data/history.json`, `data/oil-prices.json`) | Généré par GitHub Action |
| Pipeline | Python 3.12 (`scripts/fetch-data.py`) | Tourne toutes les heures via GitHub Actions |
| Hébergement | GitHub Pages | Branche `main`, racine `/` |

## Architecture du code

```
FuelMapPrice/
├── index.html                 # Point d'entrée unique — tout le HTML est ici
├── css/
│   └── app.css                # Styles custom (Leaflet overrides, scrollbar, mobile nav, animations)
├── js/
│   ├── app.js                 # Composant Alpine principal — navigation, état, orchestration
│   ├── data.js                # Chargement JSON, filtrage par rayon (Haversine), tri par prix, helper fetchWithTimeout
│   ├── geocoding.js           # Nominatim : autocomplétion villes + reverse geocoding
│   ├── map.js                 # Leaflet : init, marqueurs colorés, clusters, cercle rayon, popups
│   ├── preferences.js         # localStorage opt-in, toggles autocomplete/clustering/persistence
│   ├── trends.js              # Chart.js : courbes historiques, KPIs, calcul tendance
│   ├── geopolitics.js         # Cours Brent/WTI, graphique, fil d'actus GDELT
│   └── version.js             # Source unique de vérité pour le numéro de version
├── scripts/
│   └── fetch-data.py          # Télécharge XML data.gouv.fr → parse → produit les JSON
├── data/                      # Généré automatiquement — NE PAS ÉDITER À LA MAIN
│   ├── stations.json          # ~11 000 stations avec prix courants
│   ├── history.json           # Moyennes nationales quotidiennes (6 mois glissants)
│   └── oil-prices.json        # Cours Brent/WTI (source EIA)
├── .github/workflows/
│   └── update-data.yml        # Cron toutes les heures (minute 07)
├── CHANGELOG.md               # Convention Keep a Changelog
├── CLAUDE.md                  # Ce fichier
├── RAPPORT_CORRECTIFS_P0P1_v1.md  # Rapport des correctifs sécurité P0+P1
└── RAPPORT_CORRECTIFS_P2_v1.md    # Rapport des correctifs sécurité P2
```

## Namespace JavaScript

Tous les modules s'enregistrent sur l'objet global `window.FMP` :
- `FMP.Data` — chargement et filtrage des données
- `FMP.Map` — carte Leaflet
- `FMP.Trends` — graphiques Chart.js (tendances)
- `FMP.Geocoding` — Nominatim + autocomplétion
- `FMP.Preferences` — gestion des préférences utilisateur
- `FMP.Version` — numéro de version, date, badge "Nouveau"

Le composant Alpine `fuelMapApp()` dans `app.js` orchestre tout et expose l'état réactif au template HTML.

## Conventions à respecter

### Code
- **Zéro build step** : pas de bundler, pas de npm, pas de compilation. Tout est chargé via CDN ou fichiers locaux.
- **Français partout** : commentaires, variables parlantes, messages UI, commits.
- **Module pattern** : chaque fichier JS utilise une IIFE qui s'enregistre sur `window.FMP`.
- **Pas de framework lourd** : Alpine.js pour la réactivité, Leaflet pour la carte, Chart.js pour les graphiques — c'est tout.
- **Mobile-first** : navigation par pages sur mobile (< 1024px), layout côte à côte sur desktop.

### Design
- **Palette** : cream `#FAF7F2`, forest `#1A3C34`, flame `#E85D04`, ink `#0F0F0E` — définie dans le `tailwind.config` inline.
- **Typographies** : Bricolage Grotesque (titres), Instrument Sans (corps), JetBrains Mono (code/chiffres).
- **Mode sombre** : automatique via `prefers-color-scheme: dark`. Vérifier que tout changement reste lisible dans les deux thèmes.

### Versioning
- Mettre à jour `js/version.js` (number + date + label) à chaque release.
- Ajouter une section en haut de `CHANGELOG.md` au format Keep a Changelog.
- Commits en français, style conventionnel : `feat:`, `fix:`, `chore:`, `refactor:`.

### Données
- Le dossier `data/` est auto-généré par la GitHub Action — ne jamais y toucher manuellement.
- Le script `fetch-data.py` utilise uniquement la stdlib Python (pas de pip install).
- Respecter le rate-limit Nominatim : 1 requête/seconde, User-Agent identifié.

## Pièges connus

- **Tailwind Play CDN et sécurité** : `cdn.tailwindcss.com` est un script de runtime qui compile le CSS dans le navigateur. Il nécessite `'unsafe-inline'` + `'unsafe-eval'` dans la CSP et ne supporte pas SRI (contenu dynamique). C'est un compromis accepté pour la stratégie zéro-build. Si ce CDN était compromis, l'impact serait une XSS totale. Ce risque est jugé acceptable pour un projet personnel hébergé sur GitHub Pages, mais devrait être réévalué si le projet gagne en audience.
- **Tailwind Play CDN** : pas de `@apply`, pas de classes dynamiques construites par concaténation de strings. Les classes doivent apparaître en entier dans le HTML.
- **Alpine.js** : les expressions `x-data`, `x-bind`, `x-on` sont évaluées dans le scope du composant — pas de variable globale directe.
- **Leaflet `invalidateSize()`** : doit être appelé après tout changement de visibilité du conteneur carte (navigation mobile, changement d'onglet).
- **CORS data.gouv.fr** : le flux XML officiel ne supporte pas toujours CORS → c'est pourquoi on passe par la GitHub Action côté serveur.
- **Encodage Unicode** : certaines chaînes dans `app.js` utilisent des séquences d'échappement (`é` etc.) — ne pas les "corriger" en caractères bruts, c'est intentionnel pour éviter les problèmes d'encodage sur certains systèmes.

## Règles de sécurité

Ces règles sont issues de l'audit de sécurité v1.6.0 (22 findings, corrigés en v1.6.1–v1.6.4). Elles s'appliquent à **toute modification de code**, même si le prompt ne mentionne pas explicitement la sécurité.

### Entrées et sorties
- Toute donnée externe (JSON, API, utilisateur) est **non fiable par défaut**
- Échapper avec `escapeHtml()` (défini dans `map.js`) avant toute injection dans le DOM ou les popups Leaflet
- Valider le type et la plage des inputs utilisateur : `selectedFuel` via whitelist `VALID_FUELS`, `maxPrice` clampé [0.5, 5.0], `radius` clampé [5, 50]
- Les URLs provenant d'API externes (GDELT) doivent être validées : seuls les schémas `http://` et `https://` sont acceptés

### Réseau
- **Tout `fetch()` côté client passe par `FMP.Data.fetchWithTimeout()`** — jamais de `fetch()` nu
- Timeouts par défaut : stations 15s, history 10s, oil-prices 10s, GDELT 15s, Nominatim 5s
- Les URLs construites dynamiquement utilisent `encodeURIComponent()` sur les paramètres
- Respecter le rate-limit Nominatim : debounce 350ms minimum, User-Agent identifié

### CSP et intégrité
- La CSP est définie dans une balise `<meta>` dans `index.html` — la maintenir à jour si un nouveau domaine est ajouté
- Tout nouveau script CDN doit avoir un attribut `integrity` (SRI) et `crossorigin="anonymous"`, sauf Tailwind Play CDN (contenu dynamique, compromis accepté)
- Tous les liens externes avec `target="_blank"` doivent avoir `rel="noopener noreferrer"`
- La meta `referrer` est `strict-origin-when-cross-origin`

### Pipeline Python
- Protection XXE : sniff DOCTYPE/ENTITY avant `ET.fromstring()`
- Validation taille ZIP avant extraction (max 200 Mo)
- Seuil de plausibilité : minimum 5000 stations avant d'écraser `stations.json`
- Cours pétrole : filtrer les valeurs hors plage (0 < prix < 500 USD, pas de dates futures)
- Stdlib uniquement — pas de `pip install`, surface d'attaque réduite

### GitHub Actions
- Les actions tierces sont pinnées par **hash de commit**, pas par tag mutable
- Permissions restreintes au minimum (`contents: write` uniquement car commit nécessaire)

### Compromis acceptés
- **Tailwind Play CDN** : nécessite `'unsafe-inline'` + `'unsafe-eval'` dans la CSP, ne supporte pas SRI. Compromis accepté pour la stratégie zéro-build. Risque : XSS totale si le CDN est compromis. Acceptable pour un projet personnel sur GitHub Pages, à réévaluer si le projet gagne en audience.
- **localStorage** : stocke le nom de ville recherchée (donnée quasi-personnelle), mais uniquement en opt-in avec consentement explicite de l'utilisateur. Conforme RGPD.

## Ce qu'on attend de toi

Quand tu reçois un prompt technique de Cowork :
1. **Lis-le entièrement** avant de coder — il contient les fichiers concernés, la logique attendue, et les contraintes.
2. **Respecte l'architecture existante** — pas de nouveau framework, pas de build step, pas de dépendance npm.
3. **Teste visuellement** en mode clair ET sombre si tu touches au CSS.
4. **Mets à jour `version.js` et `CHANGELOG.md`** si c'est une nouvelle feature ou un fix notable.
5. **Commite en français** avec le bon préfixe conventionnel.
