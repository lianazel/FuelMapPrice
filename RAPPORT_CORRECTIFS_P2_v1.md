# Rapport — Application des correctifs sécurité P2

> **Date** : 2026-05-22
> **Version cible** : `1.6.2`
> **Référence** : audit `AUDIT_SECURITE_v1.6.0.md` + suite de `RAPPORT_CORRECTIFS_P0P1_v1.md`
> **Périmètre exécuté** : 8 correctifs P2 + bump version + changelog
> **Auteur** : Claude Code (ingénieur d'exécution)

---

## 1. Synthèse

| # | Correctif | Finding | Fichiers touchés | Statut |
|---|---|---|---|---|
| 1 | Helper `fetchWithTimeout()` + application aux 9 fetch front | 7.1 | `js/data.js`, `js/geocoding.js`, `js/geopolitics.js` | ✅ |
| 2 | `encodeURIComponent()` + `Number.isFinite()` sur lat/lon | 1.1 | `js/map.js` | ✅ |
| 3 | Vérification `noreferrer` complet | 1.4 cpl | `index.html` | ✅ (déjà couvert par 1.6.1, aucun manque) |
| 4 | Whitelist `selectedFuel` + clamp `maxPrice` / `radius` | 7.2 | `js/app.js` | ✅ |
| 5 | Meta `referrer-policy` | 7.3 | `index.html` | ✅ |
| 6 | Plafond taille XML interne du ZIP | 4.4 | `scripts/fetch-data.py` | ✅ |
| 7 | Validation plages cours Brent / WTI | 4.9 | `scripts/fetch-data.py` | ✅ |
| 8 | Doc risque Tailwind Play CDN | 6.2 | `CLAUDE.md` | ✅ |
| — | Bump version `1.6.1 → 1.6.2` | — | `js/version.js` | ✅ |
| — | Section changelog | — | `CHANGELOG.md` | ✅ |

**`js/geocoding.js`** : modifié pour appliquer `fetchWithTimeout()` à ses 3 requêtes Nominatim. Le fichier portait déjà une modification antérieure de JC (purement whitespace / line-endings) — celle-ci sera incluse au commit puisqu'on touche maintenant le contenu.

---

## 2. Détail par correctif

### 2.1 — Helper `fetchWithTimeout()` (correctif 1)

**Nouveau helper exposé dans `FMP.Data`** (`js/data.js`) :

```javascript
async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
```

Ajouté au `return` du module pour exposition cross-modules : `FMP.Data.fetchWithTimeout`.

**Migrations effectuées** (9 fetch au total) :

| Fichier | Fonction / contexte | Timeout |
|---|---|---|
| `js/data.js` | `loadStations()` — JSON 3 Mo | 15 000 ms |
| `js/data.js` | `loadHistory()` | 10 000 ms |
| `js/geocoding.js` | `geocodeCity()` (Nominatim search) | 5 000 ms |
| `js/geocoding.js` | `suggestCities()` (Nominatim search autocomplete) | 5 000 ms |
| `js/geocoding.js` | `reverseGeocode()` (Nominatim reverse) | 5 000 ms |
| `js/geopolitics.js` | `loadOilPrices()` | 10 000 ms |
| `js/geopolitics.js` | `loadNews()` — branche intl (GDELT) | 8 000 ms |
| `js/geopolitics.js` | `loadNews()` — branche FR (GDELT) | 8 000 ms |
| `js/geopolitics.js` | `loadNews()` — branche EN (GDELT) | 8 000 ms |

**Vérif** : `grep "fetch(" js/` ne retourne plus que la définition du helper lui-même (data.js:13 docstring + data.js:21 implémentation). Aucun appel ne contourne le timeout.

**`js/app.js`** : ne contenait pas de `fetch()` direct → rien à migrer.

---

### 2.2 — Sécurisation des coordonnées dans les URLs d'itinéraire (correctif 2)

`js/map.js`, début de boucle `renderStations()` :

```javascript
// Garde-fou : coordonnées non numériques = station ignorée. Aujourd'hui
// fetch-data.py garantit des floats, mais cette validation rend le
// template literal des URLs ci-dessous robuste à toute évolution amont.
if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
```

Puis encodage des coords avant injection dans les URLs `href` :

```javascript
const safeLat = encodeURIComponent(s.lat);
const safeLon = encodeURIComponent(s.lon);
const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${safeLat},${safeLon}&travelmode=driving`;
const appleUrl  = `https://maps.apple.com/?daddr=${safeLat},${safeLon}&dirflg=d`;
```

Double défense : la validation rejette les non-numériques (impossible aujourd'hui mais robuste à une régression amont), l'encodage neutralise toute évasion de contexte URL.

---

### 2.3 — `noreferrer` complet (correctif 3)

Vérification post-1.6.1 (`grep target="_blank"` dans `index.html`) : **4 occurrences, toutes déjà en `rel="noopener noreferrer"`**. Aucune action requise. Confirmation tracée ici à titre documentaire.

---

### 2.4 — Validation inputs utilisateur (correctif 4)

`js/app.js` — nouvelle constante en tête du composant Alpine :

```javascript
VALID_FUELS: Object.freeze(['SP95', 'SP98', 'Gazole', 'E10', 'E85', 'GPLc']),
```

Sanitization au passage de la frontière front → data, dans le getter `filteredStations` :

```javascript
get filteredStations() {
  if (!this.refPoint || this.stations.length === 0) return [];

  // On NE mutate PAS this.* ici (boucle de réactivité Alpine).
  // Valeurs locales sûres → passées à filterStations.
  const fuel = this.VALID_FUELS.includes(this.selectedFuel) ? this.selectedFuel : 'SP95';
  const radius = Math.max(5, Math.min(50, parseInt(this.radius, 10) || 10));
  const maxPrice = (this.maxPrice != null && this.maxPrice !== '')
    ? Math.max(0.5, Math.min(5.0, parseFloat(this.maxPrice) || 0))
    : null;

  return FMP.Data.filterStations(
    this.stations, this.refPoint.lat, this.refPoint.lon,
    fuel, radius, maxPrice,
  );
},
```

**Choix technique** : sanitize-at-read plutôt que mutation. Le prompt suggérait `this.selectedFuel = 'SP95'` en fallback, mais une mutation dans un getter Alpine.js déclenche une boucle de réactivité (`$watch('selectedFuel')` → rerun du getter → nouvelle assignation…). La forme « valeur locale clampée » donne la même garantie sans risque de boucle.

**Limites de l'input HTML conservées** (`min="0.5" max="3"` sur `maxPrice`, `min="5" max="50"` sur `radius`) — la sanitization JS est une défense en profondeur contre une manipulation via la console développeur.

---

### 2.5 — Referrer policy (correctif 5)

`index.html`, juste avant la CSP :

```html
<meta name="referrer" content="strict-origin-when-cross-origin">
```

Conséquence : les sites externes (Google Maps, Apple Plans, GDELT, fonts.googleapis, etc.) reçoivent uniquement `https://lianazel.github.io` dans le header `Referer` — plus le chemin, plus la query string Nominatim contenant le nom de ville.

---

### 2.6 — Plafond taille XML / ZIP (correctif 6)

`scripts/fetch-data.py` :

Constante ajoutée :
```python
MAX_XML_SIZE = 200 * 1024 * 1024  # 200 Mo
```

Garde-fou dans `download_xml()`, **avant** `z.open(...).read()` :
```python
info = z.getinfo(members[0])
if info.file_size > MAX_XML_SIZE:
    raise RuntimeError(
        f"XML interne trop grand : {info.file_size:,} o "
        f"(plafond {MAX_XML_SIZE:,} o — protection zip bomb)."
    )
```

`getinfo()` lit la taille déclarée dans l'en-tête ZIP **sans extraire**, donc une bombe de plusieurs Go est rejetée sans allocation mémoire.

---

### 2.7 — Validation plages cours pétrole (correctif 7)

`scripts/fetch-data.py`, constantes ajoutées :
```python
MIN_OIL_PRICE = 1.0       # USD/baril
MAX_OIL_PRICE = 500.0     # pic historique 2008 ≈ 147 $
```

Refonte de `fetch_oil_csv()` :
- Validation `MIN_OIL_PRICE <= price <= MAX_OIL_PRICE` (filtre NaN implicite par la comparaison)
- Validation `date <= today_iso` (rejet des dates futures)
- Comptage des lignes ignorées avec log explicite (`! N ligne(s) de cours ignorée(s)`)

Pas d'erreur fatale : les entrées invalides sont silencieusement filtrées. Si `0` ligne valide → `oil-prices.json` finit vide → l'app affiche le message « données pas encore dispo » (comportement existant).

---

### 2.8 — Documentation Tailwind Play CDN (correctif 8)

Nouveau point ajouté en tête de la section « Pièges connus » de `CLAUDE.md`. Le texte original (proposé par le prompt) est conservé tel quel :

> **Tailwind Play CDN et sécurité** : `cdn.tailwindcss.com` est un script de runtime qui compile le CSS dans le navigateur. Il nécessite `'unsafe-inline'` + `'unsafe-eval'` dans la CSP et ne supporte pas SRI (contenu dynamique). C'est un compromis accepté pour la stratégie zéro-build. Si ce CDN était compromis, l'impact serait une XSS totale. Ce risque est jugé acceptable pour un projet personnel hébergé sur GitHub Pages, mais devrait être réévalué si le projet gagne en audience.

---

## 3. Vérifications post-modifications

| Check | Résultat |
|---|---|
| Syntaxe Python (`ast.parse`) | ✅ OK |
| Aucun `fetch()` direct hors helper | ✅ Confirmé (`grep` ne retourne que data.js:13 docstring + data.js:21 impl) |
| `VALID_FUELS` couvre les 6 carburants attendus | ✅ Cohérent avec le `<select>` ligne 175-181 de `index.html` |
| `Math.max(5, Math.min(50, ...))` cohérent avec `min/max` HTML du slider | ✅ |
| `Math.max(0.5, Math.min(5.0, ...))` cohérent avec `min="0.5" max="3"` HTML | ⚠️ Volontairement plus large que le HTML (plafond à 5 €/L plutôt qu'à 3 €/L) — laisse une marge si JC veut élargir le slider plus tard sans toucher au JS |
| Referrer-policy avant la CSP | ✅ Ordre cosmétique respecté |
| MAX_XML_SIZE généreux (200 Mo vs ~50 Mo réel) | ✅ Marge x4 pour absorber une croissance organique |
| Plages cours pétrole : [1, 500] USD | ✅ Couvre tous les régimes historiques connus |

---

## 4. Points d'attention pour JC / Cowork

### À tester avant déploiement

1. **Onglet Carte** : lancer une recherche, vérifier que la liste des stations s'affiche normalement (sanitization du getter `filteredStations` n'introduit aucun bug visible).

2. **Onglet Géopolitique** : vérifier que les actus GDELT se chargent et que les cours pétrole s'affichent. Si timeout 8 s GDELT trop court, on verra des « Aucune actualité disponible » → à ajuster.

3. **Couper le réseau pendant le chargement** : avec DevTools → Network → Offline ou throttling « Slow 3G », vérifier qu'après les timeouts (max 15 s pour stations.json), l'app affiche bien un message d'erreur au lieu de rester sur « Chargement… ».

4. **Manipulation console (test de sanitization)** :
   ```javascript
   Alpine.$data(document.querySelector('[x-data]')).selectedFuel = 'EVIL'
   Alpine.$data(document.querySelector('[x-data]')).radius = 9999
   ```
   La liste doit retomber sur SP95 et un rayon de 50 km, pas crasher.

5. **Pipeline GitHub Action** : déclencher manuellement après push pour valider que le nouveau check zip-bomb + plages pétrole ne rejettent pas de données légitimes.

### `js/geocoding.js`

Ce fichier portait une modification antérieure de JC (purement whitespace / line-endings — `git diff --ignore-all-space` retournait vide). En appliquant `fetchWithTimeout()` dessus, les deux changements seront mêlés dans le commit. Si JC préfère séparer, on peut faire un commit dédié avant.

---

## 5. Reste à faire (findings P3 non couverts par cette vague)

Les 8 findings P3 de l'audit n'ont **pas** été traités, conformément au périmètre :

- **3.1** : mention « ville stockée » dans le hint persistance
- **5.1** : faire passer `fmp.prefsTip.v2` par `FMP.Prefs`
- **7.4** : token-bucket Nominatim 1 req/s
- **7.5** : module log silencieux configurable
- **7.6** : corriger lien GitHub `index.html:564` (cassé, pointe sur github.com)
- **7.8** : filtrer les clés du `JSON.parse` localStorage (prototype pollution)
- **4.7** : uniformiser les timeouts urlopen (60s / 30s)
- **4.8** : URL réelle du repo dans le `User-Agent` Python

Effort agrégé estimé < 1 h. À grouper en une vague « hygiène » quand JC le souhaite.

---

*Fin du rapport.*
