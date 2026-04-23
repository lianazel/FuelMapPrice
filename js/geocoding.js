/* ===================================================================
 * geocoding.js — Nominatim (OpenStreetMap)
 * Usage gratuit sous réserve de respecter :
 *   - 1 requête/seconde max (on met un petit cache pour éviter les doublons)
 *   - un User-Agent explicite (via le paramètre `email` par courtoisie)
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Geocoding = (function () {

  const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const cache = new Map(); // q -> {lat, lon, displayName}

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
      headers: {
        // Nominatim demande un User-Agent descriptif ;
        // côté navigateur on ne peut pas le modifier, donc un Referer suffit.
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error('Géocodage indisponible');
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const top = data[0];
    const out = {
      lat: parseFloat(top.lat),
      lon: parseFloat(top.lon),
      displayName: top.display_name,
    };
    cache.set(key, out);
    return out;
  }

  async function reverseGeocode(lat, lon) {
    const params = new URLSearchParams({
      lat, lon,
      format: 'json',
      zoom: '10',
      addressdetails: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.address) return null;
    return data.address.city || data.address.town || data.address.village || data.address.municipality || null;
  }

  return { geocodeCity, reverseGeocode };
})();
