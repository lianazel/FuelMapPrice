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
      // on demande la bounding box pour pouvoir "cadrer" naturellement
      // sur une ville, un d\u00e9partement, une r\u00e9gion ou le pays entier
      polygon_geojson: '0',
      extratags: '0',
      namedetails: '0',
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error('G\u00e9ocodage indisponible');
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const top = data[0];

    // Nominatim nous dit dans `addresstype` ou `type` / `class` ce qu'il a trouv\u00e9 :
    // - "city" / "town" / "village" / "municipality" \u2192 une commune \u2192 recherche cibl\u00e9e
    // - "county" / "state_district" \u2192 un d\u00e9partement \u2192 vue large
    // - "state" \u2192 une r\u00e9gion \u2192 vue tr\u00e8s large
    // - "country" \u2192 tout le pays
    // On traduit \u00e7a en un "scope" exploitable par l'app.
    const addressType = (top.addresstype || top.type || '').toLowerCase();
    const placeClass  = (top.class || '').toLowerCase();
    let scope = 'city';  // par d\u00e9faut, on consid\u00e8re que c'est une commune
    if (addressType === 'country' || placeClass === 'boundary' && addressType === 'country') {
      scope = 'country';
    } else if (addressType === 'state' || addressType === 'region') {
      scope = 'region';
    } else if (['county', 'state_district', 'province', 'department'].includes(addressType)) {
      scope = 'department';
    }

    // La bounding box Nominatim : [south, north, west, east]
    // Leaflet veut [[sud, ouest], [nord, est]] pour fitBounds.
    let bounds = null;
    if (Array.isArray(top.boundingbox) && top.boundingbox.length === 4) {
      const [s, n, w, e] = top.boundingbox.map(parseFloat);
      bounds = [[s, w], [n, e]];
    }

    const out = {
      lat: parseFloat(top.lat),
      lon: parseFloat(top.lon),
      displayName: top.display_name,
      scope,
      bounds,
    };
    cache.set(key, out);
    return out;
  }

  async function reverseGeocode(lat, lon) {
    const params = new URLSearchParams({
      lat, lon,
      format: 'json',
      // zoom 12 = niveau ville/commune (10 \u00e9tait trop large, remontait au d\u00e9partement)
      zoom: '12',
      addressdetails: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.address) return null;
    const a = data.address;
    return a.city || a.town || a.village || a.municipality || a.suburb || a.county || null;
  }

  return { geocodeCity, reverseGeocode };
})();
