# Changelog

Toutes les modifications notables apportées à **FuelMapPrice** sont documentées
dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Versioning Sémantique](https://semver.org/lang/fr/).

---

## [1.3.1] — 2026-04-24

### Ajouté
- Numéro de version visible dans le footer de l'application, cliquable pour accéder à ce changelog
- Badge ✨ **Nouveau** affiché pendant les 3 jours suivant chaque déploiement
- Bloc « À propos » détaillé dans le panneau de préférences (version, date de build, libellé, lien changelog)
- Nouveau module `js/version.js` — source unique de vérité pour le numéro de version
- Ce fichier `CHANGELOG.md` à la racine du projet

---

## [1.3] — 2026-04-24

### Ajouté
- **Panneau de préférences** accessible via l'icône ⚙️ dans le header
- **Autocomplete** de villes, départements et régions pendant la saisie
  (debounce 350 ms, 5 suggestions max, à partir de 3 caractères)
- Toggle « Suggestions intelligentes » activé par défaut (opt-out possible)
- Toggle « Mémoriser mes préférences sur cet appareil » (opt-in RGPD-friendly)
- Bouton 🧭 **Itinéraire** dans les popups de stations
  (ouvre Apple Plans sur iOS, Google Maps ailleurs)
- Bouton 🔄 **Recharger la carte** — filet de sécurité contre les bugs d'affichage Safari iOS
- Message contextualisé en cas de géolocalisation refusée/indisponible
  (instructions spécifiques iOS pour ré-autoriser)
- Nouveau module `js/preferences.js` — fondation pour toutes les préférences futures
- Badges de scope colorés dans la liste d'autocomplete (Ville / Département / Région / Pays)

### Corrigé
- Contraste du sélecteur carburant `<select>` sur iOS
  (ajout de `color-scheme: light dark` pour que le widget natif suive le thème système)
- Fiabilité du rendu cartographique après `fitBounds` sur petite commune

---

## [1.2.1] — 2026-04-23

### Corrigé
- Appel systématique de `map.invalidateSize()` avant chaque changement de vue carte
  pour corriger l'affichage de Leaflet après un `fitBounds` sur une zone très petite
- Ajustement de `maxZoom` de 12 à 14 dans `fitBounds` pour les petites communes
- Animation activée sur `fitBounds` pour une transition visuelle fluide

---

## [1.2] — 2026-04-23

### Ajouté
- **Détection automatique du scope** saisi par l'utilisateur :
  ville, département, région ou pays (via `addresstype` Nominatim)
- **Cadrage intelligent** via `fitBounds` : la carte s'adapte automatiquement
  à la zone trouvée (tout un département, toute une région, etc.)
- **Rayon auto-ajusté** selon le scope : 40 km pour un département, 50 km pour une région/pays
- **Recherche au quitter-de-champ (blur)** en plus de la touche Entrée
- **Rebascule automatique en mode ville** lorsqu'un clic sur la carte succède à une vue départementale
- Messages de statut enrichis : « centré sur département Seine-et-Marne »,
  « centré sur région Île-de-France », etc.

### Modifié
- Placeholder du champ ville : « Ex : Lyon, Seine-et-Marne, Bretagne… »

---

## [1.1] — 2026-04-23

### Ajouté
- **Clic sur la carte** → reverse-geocoding + recentrage automatique sur la ville cliquée
  (debounce 600 ms pour respecter la limite Nominatim)
- **Prix max en mode lazy** : la recherche se déclenche au quitter-de-champ, plus à chaque frappe
- Bouton **✕** pour vider rapidement le champ Prix max
- Ligne d'astuce sous la carte : « Cliquez n'importe où sur la carte pour recentrer la recherche »

### Modifié
- Step du champ Prix max : `0.05` au lieu de `0.01` (évite le piège du scroll souris accidentel)
- Bornes du champ Prix max : min `0.5`, max `3`
- Reverse-geocode : zoom 12 au lieu de 10 (remonte à la commune précise plutôt qu'au département)

---

## [1.0] — 2026-04-23

### Version initiale

Première mise en production de FuelMapPrice — version de référence livrée lors
de l'étude transposant l'application WPF FuelMap France en application web.

### Fonctionnalités
- **Onglet Carte** :
  - Saisie d'une ville de référence (géocodage Nominatim)
  - Bouton « Ma position » (géolocalisation HTML5)
  - Filtres : carburant (SP95, SP98, Gazole, E10, E85, GPLc), prix max, rayon (5-50 km)
  - Marqueurs colorés selon la distribution des prix (vert / ambre / rouge)
  - Prix lisible directement sur le marqueur en forme de goutte
  - Popup détaillé au clic (nom, adresse, prix, date de mise à jour, distance)
  - Liste latérale des stations triées par prix croissant
- **Onglet Tendances** :
  - Courbes d'évolution des prix moyens nationaux sur 6 mois
  - Sélection d'un carburant ou multi-courbes (« Tous »)
  - Périodes : 7 jours, 1 mois, 3 mois, 6 mois
  - Indicateurs : prix moyen, min, max, tendance hebdomadaire
- **Pipeline de données** :
  - GitHub Action cronée (toutes les heures à minute 07)
  - Téléchargement + parsing du flux officiel data.gouv.fr
  - Agrégation quotidienne dans un historique 6 mois glissants
- **Design** :
  - Responsive mobile-first
  - Mode sombre automatique (via `prefers-color-scheme`)
  - Typographie éditoriale (Bricolage Grotesque + Instrument Sans + JetBrains Mono)
- **Architecture** :
  - Zero build step (Tailwind CSS via CDN, Alpine.js, Leaflet, Chart.js)
  - Hébergement gratuit via GitHub Pages
  - Aucune collecte de données utilisateur

---

## Format des entrées

Chaque version suit ce format :

- **Ajouté** pour les nouvelles fonctionnalités
- **Modifié** pour les changements de fonctionnalités existantes
- **Déprécié** pour les fonctionnalités bientôt retirées
- **Supprimé** pour les fonctionnalités retirées
- **Corrigé** pour les corrections de bugs
- **Sécurité** pour les vulnérabilités corrigées

[Keep a Changelog]: https://keepachangelog.com/fr/1.1.0/
