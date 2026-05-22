/* ===================================================================
 * data.js — Chargement des fichiers JSON produits par la GitHub Action
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Data = (function () {

  const STATIONS_URL = 'data/stations.json';
  const HISTORY_URL  = 'data/history.json';

  /**
   * fetch() avec timeout — évite de bloquer l'UI sur « Chargement… »
   * si un serveur (Nominatim, GDELT, raw github…) ne répond pas.
   * Réutilisable par tous les modules via FMP.Data.fetchWithTimeout.
   */
  async function fetchWithTimeout(url, options = {}, ms = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function loadStations() {
    // 15 s : le JSON pèse ~3 Mo, on laisse une marge pour les connexions lentes.
    const res = await fetchWithTimeout(STATIONS_URL, { cache: 'no-cache' }, 15000);
    if (!res.ok) throw new Error(`Échec du chargement des stations (HTTP ${res.status})`);
    return await res.json();
  }

  async function loadHistory() {
    try {
      const res = await fetchWithTimeout(HISTORY_URL, { cache: 'no-cache' }, 10000);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Pas de données historiques disponibles pour le moment.', e);
      return null;
    }
  }

  /**
   * Haversine — distance entre deux points GPS en km.
   */
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Filtre + enrichit les stations (ajoute distance + prix du carburant demandé).
   */
  function filterStations(stations, refLat, refLon, fuel, radiusKm, maxPrice) {
    const r = [];
    for (const s of stations) {
      const price = s.prices && s.prices[fuel];
      if (price == null) continue;
      if (maxPrice && price > maxPrice) continue;

      const d = distanceKm(refLat, refLon, s.lat, s.lon);
      if (d > radiusKm) continue;

      // Rupture : le carburant sélectionné est-il signalé en rupture ?
      const isRupture = Array.isArray(s.ruptures) && s.ruptures.includes(fuel);

      r.push({
        ...s,
        price,
        distance: d,
        updated: s.updated_at && s.updated_at[fuel] ? s.updated_at[fuel] : s.updated_at_global,
        rupture: isRupture,
      });
    }
    r.sort((a, b) => a.price - b.price);
    return r;
  }

  return {
    loadStations,
    loadHistory,
    distanceKm,
    filterStations,
    fetchWithTimeout,
  };
})();
