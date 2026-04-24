/* ===================================================================
 * geocoding.js — Nominatim (OpenStreetMap)
 * Usage gratuit sous réserve de respecter :
 *   - 1 requête/seconde max (on met un petit cache pour éviter les doublons)
 *   - un User-Agent explicite (via le paramètre `email` par courtoisie)
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Geocoding = (function () {

  const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const cache = new Map(); // q -> {lat, lon, displayName, scope, bounds}

  /**
   * Géocode une ville/département/région → coordonnées + bounding box + scope.
   */
  async function geocodeCity(query) {
    if (!query || query.trim().length < 2) return null;
    const key = query.trim().toLowerCase();
    if (cache.has(key)) return cache.get(key);

    const params = new URLSearchParams({
      q: query + ', France',
      format: 'json',
      limit: '1',
      countrycodes: 'fr',
      addressdetails: '0',
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error('Géocodage indisponible');
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const top = data[0];

    const out = buildLocation(top);
    cache.set(key, out);
    return out;
  }

  /**
   * Autocomplete de villes/lieux pendant la saisie.
   * Renvoie un tableau de suggestions {label, raw, lat, lon, scope, bounds} (max 5).
   *
   * - Filtré par la France uniquement
   * - Accepte villes, villages, départements, régions
   * - L'appelant est responsable du debounce (350 ms recommandé)
   */
  async function suggestCities(query) {
    if (!query || query.trim().length < 3) return [];
    const q = query.trim();

    const params = new URLSearchParams({
      q: q + ', France',
      format: 'json',
      limit: '5',
      countrycodes: 'fr',
      addressdetails: '1',
      'accept-language': 'fr',
    });

    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map(item => {
        const a = item.address || {};
        const mainName = a.city || a.town || a.village || a.municipality
                      || a.county || a.state || item.name || item.display_name.split(',')[0];
        const context = a.county && a.county !== mainName
                      ? a.county
                      : (a.state && a.state !== mainName ? a.state : null);
        const label = context ? `${mainName} (${context})` : mainName;

        const loc = buildLocation(item);
        return { ...loc, label, raw: mainName };
      });
    } catch (e) {
      console.warn('Autocomplete indisponible :', e);
      return [];
    }
  }

  /**
   * Reverse-geocoding : coordonnées GPS → nom de commune.
   */
  async function reverseGeocode(lat, lon) {
    const params = new URLSearchParams({
      lat, lon,
      format: 'json',
      zoom: '12', // niveau ville/commune
      addressdetails: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.address) return null;
    const a = data.address;
    return a.city || a.town || a.village || a.municipality || a.suburb || a.county || null;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function buildLocation(item) {
    const addressType = (item.addresstype || item.type || '').toLowerCase();
    const placeClass  = (item.class || '').toLowerCase();
    let scope = 'city';
    if (addressType === 'country' || (placeClass === 'boundary' && addressType === 'country')) {
      scope = 'country';
    } else if (['state', 'region'].includes(addressType)) {
      scope = 'region';
    } else if (['county', 'state_district', 'province', 'department'].includes(addressType)) {
      scope = 'department';
    }

    let bounds = null;
    if (Array.isArray(item.boundingbox) && item.boundingbox.length === 4) {
      const [s, n, w, e] = item.boundingbox.map(parseFloat);
      bounds = [[s, w], [n, e]];
    }

    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name,
      scope,
      bounds,
    };
  }

  return { geocodeCity, suggestCities, reverseGeocode };
})();
