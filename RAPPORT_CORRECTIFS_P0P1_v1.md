# Rapport — Application des correctifs sécurité P0 + P1

> **Date** : 2026-05-22
> **Version cible** : `1.6.1`
> **Référence** : audit `AUDIT_SECURITE_v1.6.0.md`
> **Périmètre exécuté** : 7 correctifs P0/P1 + bump version + changelog
> **Auteur** : Claude Code (ingénieur d'exécution)

---

## 1. Synthèse

| Correctif | Finding | Priorité | Statut |
|---|---|---|---|
| 1. CSP `<meta>` | 2.1 | 🔴 P0 | ✅ Appliqué |
| 2. SRI sur scripts CDN | 6.1 | 🔴 P0 | ✅ Appliqué (5 ressources : 3 JS + 2 CSS) |
| 3. Validation URL GDELT | 1.3 | 🟠 P1 | ✅ Appliqué |
| 4. `rel="noopener noreferrer"` | 1.4 | 🟠 P1 | ✅ Appliqué (4 occurrences index.html + 2 map.js) |
| 5. Pinning hashes GitHub Actions | 4.2 | 🟠 P1 | ✅ Appliqué (versions stables les plus récentes) |
| 6. Protection XXE Python | 4.3 | 🟠 P1 | ✅ Appliqué |
| 7. Seuil de plausibilité | 4.5 | 🟠 P1 | ✅ Appliqué (`MIN_PLAUSIBLE_STATIONS = 5000`) |
| Bump version `1.6.1` | — | — | ✅ `js/version.js` mis à jour |
| Section changelog | — | — | ✅ `CHANGELOG.md` enrichi |

**Aucun fichier hors périmètre n'a été modifié.**

---

## 2. Détail des modifications, fichier par fichier

### `index.html`

#### 2.1 — CSP (insérée après `<meta name="theme-color">`)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com;
  connect-src 'self' https://nominatim.openstreetmap.org https://donnees.roulez-eco.fr https://data.economie.gouv.fr https://api.gdeltproject.org;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
  img-src 'self' data: https://*.tile.openstreetmap.org;
  font-src https://fonts.gstatic.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

Compromis acceptés (documentés en commentaire au-dessus de la balise) :
- `'unsafe-inline'` requis par Alpine.js (directives évaluées en runtime)
- `'unsafe-eval'` requis par Tailwind Play CDN (compile le CSS dans le navigateur)

#### 2.2 — SRI sur les 5 ressources CDN restantes

| Ressource | Algorithme | Hash |
|---|---|---|
| MarkerCluster.css | sha384 | `pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV` |
| MarkerCluster.Default.css | sha384 | `wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+` |
| leaflet.markercluster.js | sha384 | `eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr` |
| chart.umd.min.js (4.4.1) | sha384 | `9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4` |
| alpinejs/cdn.min.js (3.14.1) | sha384 | `l8f0VcPi/M1iHPv8egOnY/15TDwqgbOR1anMIJWvU6nLRgZVLTLSaNqi/TOoT5Fh` |

Tous les hashes ont été générés en live via :
```bash
curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A
```

Leaflet (CSS + JS) avait déjà ses attributs `integrity` — non touchés. Tailwind Play CDN et Google Fonts ne supportent pas SRI (contenu dynamique) — exclus comme prévu.

#### 2.3 — `rel="noopener noreferrer"` (4 occurrences)

Remplacement de `rel="noopener"` → `rel="noopener noreferrer"` aux lignes 540, 551, 703, 727. Empêche la fuite de `Referer` vers les sites externes (GDELT, GitHub, sites d'actualités).

---

### `js/map.js`

#### 2.4 — `rel="noopener noreferrer"` (2 occurrences, popups Leaflet)

Lignes 168 et 171 — liens « Google Maps » et « Apple Plans » dans les popups de stations. Empêche la fuite vers Google/Apple de la query string Nominatim contenant le nom de ville recherché.

---

### `js/geopolitics.js`

#### 2.5 — Validation du schéma URL GDELT (`formatArticles()`)

Avant :
```javascript
url: a.url || '#',
```

Après :
```javascript
const rawUrl = (a.url || '').trim();
const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : '#';
// ...
url: safeUrl,
```

Bloque tous schémas dangereux : `javascript:`, `data:`, `vbscript:`, `file:`, etc. — défense contre une éventuelle compromission de l'API GDELT, dont les URLs sont consommées par `:href` Alpine.js sans validation native.

---

### `.github/workflows/update-data.yml`

#### 2.6 — Pinning par hash des actions GitHub

| Action | Avant | Après |
|---|---|---|
| `actions/checkout` | `@v4` | `@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1` |
| `actions/setup-python` | `@v5` | `@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0` |

**Méthode** : récupération des versions les plus récentes dans les majors `v4` et `v5` via `GET /repos/{owner}/{repo}/releases`, puis résolution du SHA via `GET /repos/{owner}/{repo}/git/refs/tags/{tag}`. Pas de saut de major (v6 disponible mais risque de breaking changes non audité).

**Commentaire ajouté** au-dessus du step expliquant la motivation (attaque tj-actions/changed-files de mars 2025).

---

### `scripts/fetch-data.py`

#### 2.7 — Protection XXE (`parse_stations()`)

Sniff des 4 premiers Ko du flux avant `ET.fromstring()` :

```python
header = xml_bytes[:4096]
if b'<!DOCTYPE' in header or b'<!ENTITY' in header:
    raise RuntimeError("XML refusé : DOCTYPE/ENTITY détecté (risque XXE).")
```

Refuse tout flux contenant une déclaration `DOCTYPE` ou `ENTITY` — protection contre les attaques XXE et billion-laughs. La source data.gouv.fr ne devrait jamais publier ce type de contenu : un déclenchement = signal fort de compromission amont.

#### 2.8 — Seuil de plausibilité

Constante ajoutée en tête de fichier :
```python
MIN_PLAUSIBLE_STATIONS = 5000   # historiquement ~10 000-11 000
```

Garde-fou dans `main()` :
```python
if len(stations) < MIN_PLAUSIBLE_STATIONS:
    print(f"ERREUR : {len(stations)} stations seulement (seuil min {MIN_PLAUSIBLE_STATIONS}). "
          "Abandon, JSON existant préservé.", file=sys.stderr)
    return 3
```

Si le flux est tronqué/corrompu, le script abandonne avec code de retour `3` **avant** `write_stations()` → le `stations.json` existant reste intact et continue d'être servi aux utilisateurs.

---

### `js/version.js`

```javascript
number: '1.6.1',                                        // était 1.6.0
date:   '2026-05-22',                                   // était 2026-05-10
label:  'Security hardening (CSP + SRI + pipeline)',    // était 'Clustering + UX mobile'
```

---

### `CHANGELOG.md`

Nouvelle section `## [1.6.1] — 2026-05-22` insérée en tête, sous-rubrique unique `### Sécurité` listant les 7 correctifs en langage clair.

---

## 3. Vérifications effectuées

| Check | Résultat |
|---|---|
| Syntaxe Python (`ast.parse`) | ✅ OK |
| Toutes les occurrences `rel="noopener"` remplacées | ✅ Confirmé (`grep` post-edit) |
| 5 hashes SRI calculés en live (pas de copier-coller approximatif) | ✅ Confirmé |
| Hashes GitHub Actions correspondent aux tags annoncés | ✅ Vérifié via API GitHub |
| CSP couvre tous les domaines réellement contactés | ✅ Vérifié (nominatim, roulez-eco, gdelt, fonts.google, tile.osm, unpkg, jsdelivr, cdn.tailwindcss) |
| Aucune modification hors périmètre (5 fichiers + version + changelog) | ✅ Confirmé |

---

## 4. Points d'attention pour JC / Cowork

### À tester impérativement avant déploiement

1. **Charger l'app sur GitHub Pages et observer la console** : la CSP est la modification la plus risquée. Erreurs typiques à surveiller :
   - `Refused to load the image` → ajouter le domaine à `img-src`
   - `Refused to apply inline style` → vérifier le rendu (déjà couvert par `'unsafe-inline'`)
   - `Refused to connect to <URL>` → ajouter le domaine à `connect-src`

2. **Vérifier le chargement des 5 ressources avec SRI** : un hash incorrect = script non chargé = app cassée. La méthode `curl | openssl` utilisée est fiable, mais si jamais unpkg renvoie un contenu différent selon le cache ou la géolocalisation, le hash pourrait diverger. À surveiller sur le premier déploiement.

3. **Tester l'onglet Géopolitique** : c'est le seul endroit où la CSP `connect-src https://api.gdeltproject.org` est exercée. Vérifier que les actus se chargent.

4. **Tester le pipeline GitHub Actions** : déclencher manuellement le workflow via `workflow_dispatch` pour valider que les nouveaux hashes d'actions ne cassent rien et que le script Python ne lève pas le seuil de plausibilité (sauf si réel problème côté data.gouv.fr).

### Limitations conscientes

- **Pas de Permissions-Policy** : le projet n'utilise pas micro/caméra/etc., et la directive n'est pas standardisée en meta tag. Sans contrôle des headers HTTP (GitHub Pages), c'est non bloquant.
- **`'unsafe-inline'` + `'unsafe-eval'` toujours présents** : conséquence directe de la stratégie zéro-build (Tailwind Play CDN + Alpine.js). Le seul moyen de s'en débarrasser serait d'introduire un build step — décision produit, pas technique.
- **Tailwind Play CDN reste un point de confiance critique** : compromission de `cdn.tailwindcss.com` = XSS totale, indépendamment de toutes les autres protections. À documenter dans `CLAUDE.md` lors d'un prochain passage (finding 6.2 de l'audit, P2 — non couvert par cette vague).

---

## 5. Reste à faire (findings de l'audit non couverts par cette vague)

Les findings P2 et P3 de l'audit (10 items) n'ont **pas** été traités, conformément au périmètre. Pour mémoire :

- P2 : finding 1.1 (encodeURIComponent lat/lon), 4.4 (taille XML interne ZIP), 4.9 (validation cours pétrole), 6.2 (doc Tailwind), 7.2 (whitelist `selectedFuel`), 7.3 (meta referrer)
- P3 : findings 3.1, 5.1, 7.4, 7.5, 7.6, 7.8, 4.7, 4.8

Une prochaine itération pourra les adresser, idéalement groupés (P2) puis P3 en hygiène continue.

---

*Fin du rapport.*
