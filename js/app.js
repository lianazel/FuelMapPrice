/* ===================================================================
 * app.js — Composant Alpine orchestrant l'ensemble de l'application
 * =================================================================== */

function fuelMapApp() {
  return {
    // -------- Navigation --------
    activeTab: 'map',

    // -------- Données --------
    stations: [],
    history: null,
    dataStatus: 'loading',     // 'loading' | 'loaded' | 'error'
    statusMessage: 'Chargement des donn\u00e9es\u2026',

    // -------- Filtres / état carte --------
    cityInput: 'Paris',
    refPoint: null,            // {lat, lon, label, scope}
    selectedFuel: 'SP95',
    maxPrice: null,
    radius: 10,
    _lastSearchedCity: null,   // m\u00e9mo pour \u00e9viter les recherches redondantes (blur apr\u00e8s Entr\u00e9e)

    // -------- Tendances --------
    trendFuel: 'Tous',
    trendPeriod: '30',
    kpis: [],

    // -------- Préférences / UI --------
    prefsOpen: false,          // visibilit\u00e9 du panneau \u2699\ufe0f
    autocompleteEnabled: true, // copie r\u00e9active de la pr\u00e9f\u00e9rence
    persistPrefs: false,       // copie r\u00e9active du flag de persistance
    geoError: null,            // null | 'denied' | 'unavailable' | 'timeout'

    // -------- Version (expos\u00e9e pour le template) --------
    get versionNumber() { return FMP.Version?.number || '?'; },
    get versionDate()   { return FMP.Version?.formattedDate() || ''; },
    get versionLabel()  { return FMP.Version?.label || ''; },
    get versionUrl()    { return FMP.Version?.changelogUrl || '#'; },
    get versionIsNew()  { return FMP.Version?.isNew(3) || false; },

    // -------- Autocomplete --------
    suggestions: [],           // tableau renvoy\u00e9 par FMP.Geocoding.suggestCities
    showSuggestions: false,
    _autocompleteTimer: null,
    _lastQuery: '',            // \u00e9vite les requ\u00eates redondantes

    // -------- Computed --------
    get filteredStations() {
      if (!this.refPoint || this.stations.length === 0) return [];
      return FMP.Data.filterStations(
        this.stations,
        this.refPoint.lat, this.refPoint.lon,
        this.selectedFuel,
        this.radius,
        this.maxPrice,
      );
    },

    // -------- Lifecycle --------
    async init() {
      // Préférences : chargement depuis localStorage si l'utilisateur l'a accepté
      FMP.Prefs.init();
      this.autocompleteEnabled = FMP.Prefs.get('autocomplete');
      this.persistPrefs        = FMP.Prefs.isPersisted();

      // Carte init immédiat pour que le viewport soit prêt
      FMP.Map.init('map');

      // Click sur la carte → reverse-geocode + recentrage sur la ville trouvée
      FMP.Map.onMapClick((lat, lon) => this.handleMapClick(lat, lon));

      // Réactivité : dès que filteredStations change, on redessine la carte
      this.$watch('filteredStations', (list) => {
        FMP.Map.renderStations(list, this.selectedFuel);
      });
      this.$watch('radius', () => {
        if (this.refPoint) {
          FMP.Map.setReference(this.refPoint.lat, this.refPoint.lon, this.refPoint.label, this.radius);
        }
      });
      this.$watch('trendFuel',   () => this.updateChart());
      this.$watch('trendPeriod', () => this.updateChart());
      this.$watch('activeTab', (tab) => {
        if (tab === 'map') {
          this.$nextTick(() => FMP.Map.getMap()?.invalidateSize());
        } else if (tab === 'trends') {
          this.$nextTick(() => this.updateChart());
        }
      });

      await this.loadAllData();

      // Position initiale : Paris par défaut
      await this.searchCity();
    },

    // -------- Data loading --------
    async loadAllData() {
      try {
        this.dataStatus = 'loading';
        this.statusMessage = 'Chargement des stations…';
        const [stations, history] = await Promise.all([
          FMP.Data.loadStations().catch(e => { console.error(e); return null; }),
          FMP.Data.loadHistory(),
        ]);

        if (!stations) {
          this.dataStatus = 'error';
          this.statusMessage = 'Les données ne sont pas encore disponibles. Attendez le premier run de la GitHub Action.';
          return;
        }

        this.stations = stations.stations || stations;
        this.history  = history;

        const updated = stations.generated_at ? new Date(stations.generated_at) : null;
        this.dataStatus = 'loaded';
        this.statusMessage = updated
          ? `${this.stations.length.toLocaleString('fr-FR')} stations · maj ${this.formatDate(updated)}`
          : `${this.stations.length.toLocaleString('fr-FR')} stations chargées`;

        this.updateChart();
      } catch (err) {
        console.error(err);
        this.dataStatus = 'error';
        this.statusMessage = 'Erreur de chargement : ' + err.message;
      }
    },

    // -------- Actions --------
    async searchCity() {
      const q = this.cityInput.trim();
      if (!q) return;
      // \u00c9vite les recherches redondantes (blur apr\u00e8s Entr\u00e9e, m\u00eame valeur)
      if (q === this._lastSearchedCity) return;

      try {
        this.statusMessage = 'Recherche de la zone\u2026';
        const loc = await FMP.Geocoding.geocodeCity(q);
        if (!loc) {
          this.statusMessage = `Lieu \u00ab ${q} \u00bb introuvable.`;
          return;
        }
        this._lastSearchedCity = q;

        // Selon la nature du lieu, on adapte le rayon de recherche pour que
        // l'utilisateur voie tout de suite un ensemble pertinent de stations.
        // Rappel : le slider va de 5 \u00e0 50 km, on reste dans cette plage.
        const scopeToRadius = {
          country:    50,
          region:     50,   // ex : \u00cele-de-France
          department: 40,   // ex : Seine-et-Marne
          city:       this.radius,  // on garde le choix de l'utilisateur
        };
        const autoRadius = scopeToRadius[loc.scope] ?? this.radius;

        // Si on a auto-ajust\u00e9 (d\u00e9partement/r\u00e9gion), on met \u00e0 jour le slider visible.
        if (loc.scope !== 'city' && autoRadius !== this.radius) {
          this.radius = autoRadius;
        }

        this.refPoint = { lat: loc.lat, lon: loc.lon, label: q, scope: loc.scope };
        // On passe la bounding box pour un cadrage naturel (d\u00e9partement vu en entier, etc.)
        FMP.Map.setReference(loc.lat, loc.lon, q, this.radius, loc.bounds);

        if (this.dataStatus === 'loaded') {
          const scopeLabel = {
            country:    'France enti\u00e8re',
            region:     `r\u00e9gion ${q}`,
            department: `d\u00e9partement ${q}`,
            city:       q,
          }[loc.scope] || q;
          this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${scopeLabel}`;
        }

        FMP.Map.renderStations(this.filteredStations, this.selectedFuel);
      } catch (e) {
        console.error(e);
        this.statusMessage = 'G\u00e9ocodage indisponible. R\u00e9essayez dans quelques secondes.';
      }
    },

    useGeolocation() {
      if (!navigator.geolocation) {
        this.geoError = 'unavailable';
        this.statusMessage = 'La g\u00e9olocalisation n\'est pas support\u00e9e par ce navigateur.';
        return;
      }
      this.geoError = null;
      this.statusMessage = 'Localisation en cours\u2026';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          let label = 'Ma position';
          try {
            const city = await FMP.Geocoding.reverseGeocode(lat, lon);
            if (city) { label = city; this.cityInput = city; this._lastSearchedCity = city; }
          } catch {}
          this.refPoint = { lat, lon, label, scope: 'city' };
          FMP.Map.setReference(lat, lon, label, this.radius);
          this.geoError = null;
          if (this.dataStatus === 'loaded') {
            this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${label}`;
          }
          FMP.Map.renderStations(this.filteredStations, this.selectedFuel);
        },
        (err) => {
          // code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
          if (err.code === 1)      this.geoError = 'denied';
          else if (err.code === 2) this.geoError = 'unavailable';
          else if (err.code === 3) this.geoError = 'timeout';
          else                     this.geoError = 'unavailable';
          this.statusMessage = 'G\u00e9olocalisation refus\u00e9e ou indisponible.';
          console.warn(err);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    },

    focusStation(station) {
      FMP.Map.focusStation(station);
    },

    /**
     * Click sur la carte : on fait un reverse-geocoding pour identifier la ville,
     * pré-remplir le champ, et recentrer la recherche dessus.
     *
     * Un debounce de 600 ms \u00e9vite de saturer Nominatim en cas de clics r\u00e9p\u00e9t\u00e9s
     * et laisse l'utilisateur zoomer sans d\u00e9clencher une r\u00e9solution \u00e0 chaque clic.
     */
    _mapClickTimer: null,
    handleMapClick(lat, lon) {
      clearTimeout(this._mapClickTimer);
      this._mapClickTimer = setTimeout(async () => {
        this.statusMessage = 'Identification de la ville\u2026';
        try {
          const city = await FMP.Geocoding.reverseGeocode(lat, lon);
          if (!city) {
            this.statusMessage = 'Point cliqu\u00e9 hors d\'une zone habit\u00e9e reconnue.';
            return;
          }

          // Si on venait d'une vue large (d\u00e9partement/r\u00e9gion/pays), le clic carte
          // est le signal qu'on veut maintenant zoomer sur une ville pr\u00e9cise :
          // on remet un rayon "local" (10 km) plus pertinent qu'un rayon d\u00e9partemental.
          const wasWideView = this.refPoint && this.refPoint.scope && this.refPoint.scope !== 'city';
          if (wasWideView) {
            this.radius = 10;
          }

          // Mise \u00e0 jour du champ visible + du point de r\u00e9f\u00e9rence
          this.cityInput = city;
          this._lastSearchedCity = city; // \u00e9vite que le blur ult\u00e9rieur re-cherche inutilement
          this.refPoint  = { lat, lon, label: city, scope: 'city' };
          FMP.Map.setReference(lat, lon, city, this.radius);

          if (this.dataStatus === 'loaded') {
            this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${city}`;
          }
          // Le watch sur filteredStations redessinera les marqueurs automatiquement
        } catch (err) {
          console.warn('reverse-geocode \u00e9chou\u00e9 :', err);
          this.statusMessage = 'Identification de la ville indisponible.';
        }
      }, 600);
    },

    // =================================================================
    // Nouvelles m\u00e9thodes v1.3
    // =================================================================

    /**
     * Autocomplete : s'ex\u00e9cute \u00e0 chaque frappe dans le champ ville.
     * Debounce de 350 ms, minimum 3 caract\u00e8res, d\u00e9sactiv\u00e9 si la
     * pr\u00e9f\u00e9rence utilisateur est off.
     */
    onCityInput() {
      if (!this.autocompleteEnabled) {
        this.showSuggestions = false;
        this.suggestions = [];
        return;
      }
      const q = (this.cityInput || '').trim();
      if (q.length < 3 || q === this._lastQuery) {
        this.showSuggestions = false;
        this.suggestions = [];
        return;
      }
      clearTimeout(this._autocompleteTimer);
      this._autocompleteTimer = setTimeout(async () => {
        try {
          this._lastQuery = q;
          const results = await FMP.Geocoding.suggestCities(q);
          this.suggestions = results;
          this.showSuggestions = results.length > 0;
        } catch (e) {
          console.warn('suggestCities \u00e9chou\u00e9', e);
        }
      }, 350);
    },

    /**
     * L'utilisateur clique sur une suggestion : on remplit le champ,
     * ferme la liste, et utilise directement les coordonn\u00e9es d\u00e9j\u00e0
     * connues (pas de nouvelle requ\u00eate Nominatim).
     */
    selectSuggestion(sugg) {
      this.cityInput = sugg.raw;
      this.suggestions = [];
      this.showSuggestions = false;
      this._lastQuery = sugg.raw;
      this._lastSearchedCity = sugg.raw;

      // Ajustement auto du rayon selon le scope
      const scopeToRadius = { country: 50, region: 50, department: 40, city: this.radius };
      const autoRadius = scopeToRadius[sugg.scope] ?? this.radius;
      if (sugg.scope !== 'city' && autoRadius !== this.radius) {
        this.radius = autoRadius;
      }

      this.refPoint = { lat: sugg.lat, lon: sugg.lon, label: sugg.raw, scope: sugg.scope };
      FMP.Map.setReference(sugg.lat, sugg.lon, sugg.raw, this.radius, sugg.bounds);

      if (this.dataStatus === 'loaded') {
        const scopeLabel = {
          country:    'France enti\u00e8re',
          region:     `r\u00e9gion ${sugg.raw}`,
          department: `d\u00e9partement ${sugg.raw}`,
          city:       sugg.raw,
        }[sugg.scope] || sugg.raw;
        this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${scopeLabel}`;
      }
      FMP.Map.renderStations(this.filteredStations, this.selectedFuel);
    },

    /** Ferme la liste des suggestions (d\u00e9lai pour laisser le click ventrer). */
    closeSuggestionsSoon() {
      setTimeout(() => { this.showSuggestions = false; }, 180);
    },

    /**
     * Bouton "Recharger la carte" : force Leaflet \u00e0 recalculer ses
     * dimensions et \u00e0 se recentrer. Filet de s\u00e9curit\u00e9 contre les
     * bugs d'affichage mobile (Safari iOS notamment).
     */
    reloadMap() {
      this.statusMessage = 'Rechargement de la carte\u2026';
      FMP.Map.refresh(this.refPoint, this.radius);
      if (this.refPoint) {
        FMP.Map.renderStations(this.filteredStations, this.selectedFuel);
        if (this.dataStatus === 'loaded') {
          this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${this.refPoint.label}`;
        }
      } else {
        this.cityInput = 'Paris';
        this.searchCity();
      }
    },

    // ---------- Panneau Pr\u00e9f\u00e9rences ----------

    openPrefs()  { this.prefsOpen = true;  },
    closePrefs() { this.prefsOpen = false; },

    togglePref(key, value) {
      FMP.Prefs.set(key, value);
      if (key === 'autocomplete') this.autocompleteEnabled = value;
    },

    togglePersist(enabled) {
      FMP.Prefs.setPersist(enabled);
      this.persistPrefs = enabled;
    },

    clearPrefs() {
      FMP.Prefs.clear();
      this.autocompleteEnabled = FMP.Prefs.DEFAULTS.autocomplete;
      this.persistPrefs = false;
      this.statusMessage = 'Pr\u00e9f\u00e9rences r\u00e9initialis\u00e9es.';
    },

    // -------- Tendances --------
    updateChart() {
      if (this.activeTab !== 'trends') return;
      this.kpis = FMP.Trends.computeKpis(this.history, this.trendFuel, this.trendPeriod);
      FMP.Trends.render('trendChart', this.history, this.trendFuel, this.trendPeriod);
    },

    // -------- Utilitaires --------
    getPriceColor(price) {
      const prices = this.filteredStations.map(s => s.price);
      return FMP.Map.priceColor(price, prices);
    },

    formatDate(d) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const now = new Date();
      const diffMs = now - date;
      const diffH = diffMs / 3600000;
      if (diffH < 1)   return 'il y a ' + Math.max(1, Math.round(diffMs / 60000)) + ' min';
      if (diffH < 24)  return 'il y a ' + Math.round(diffH) + ' h';
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    },
  };
}
