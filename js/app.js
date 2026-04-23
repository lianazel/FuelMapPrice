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
    statusMessage: 'Chargement des données…',

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
        this.statusMessage = 'La g\u00e9olocalisation n\'est pas support\u00e9e par ce navigateur.';
        return;
      }
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
          if (this.dataStatus === 'loaded') {
            this.statusMessage = `${this.stations.length.toLocaleString('fr-FR')} stations \u00b7 centr\u00e9 sur ${label}`;
          }
          FMP.Map.renderStations(this.filteredStations, this.selectedFuel);
        },
        (err) => {
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
