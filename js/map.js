/* ===================================================================
 * map.js — Gestion de la carte Leaflet
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Map = (function () {

  let map = null;
  let refMarker = null;
  let radiusCircle = null;
  const stationMarkers = new Map(); // id -> marker

  function init(containerId, center = [46.6, 2.5], zoom = 6) {
    map = L.map(containerId, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    return map;
  }

  function getMap() { return map; }

  /**
   * Positionne le marqueur orange de r\u00e9f\u00e9rence et dessine le cercle de rayon.
   * Accepte en plus un `bounds` (bounding box Leaflet [[sud, ouest], [nord, est]])
   * pour cadrer naturellement la carte sur une zone \u2014 particuli\u00e8rement utile
   * quand l'utilisateur tape un d\u00e9partement ou une r\u00e9gion.
   */
  function setReference(lat, lon, label, radiusKm, bounds) {
    if (refMarker) { refMarker.remove(); refMarker = null; }
    if (radiusCircle) { radiusCircle.remove(); radiusCircle = null; }

    const icon = L.divIcon({
      className: '',
      html: '<div class="fmp-marker-ref"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    refMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
      .bindTooltip(label || 'Position de r\u00e9f\u00e9rence', { direction: 'top', offset: [0, -10] })
      .addTo(map);

    radiusCircle = L.circle([lat, lon], {
      radius: radiusKm * 1000,
      color: '#1A3C34',
      weight: 1.5,
      opacity: 0.4,
      fillColor: '#1A3C34',
      fillOpacity: 0.06,
      dashArray: '4, 6',
    }).addTo(map);

    // Cadrage : si on a une bounding box (d\u00e9partement, r\u00e9gion, pays\u2026), on cadre dessus.
    // Sinon, on applique un zoom adapt\u00e9 au rayon (comportement historique pour les villes).
    map.invalidateSize();
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14, animate: true });
    } else {
      const zoom = radiusKm <= 5  ? 12 :
                   radiusKm <= 10 ? 11 :
                   radiusKm <= 20 ? 10 :
                   radiusKm <= 30 ? 10 :
                                     9 ;
      map.setView([lat, lon], zoom);
    }
  }

  /**
   * Couleur d'un marqueur en fonction de la position du prix dans la distribution :
   * vert pour les moins chers, ambre pour la médiane, rouge pour les plus chers.
   */
  function priceColor(price, prices) {
    if (!prices || prices.length === 0) return '#52524E';
    const sorted = [...prices].sort((a, b) => a - b);
    const n = sorted.length;
    const q1 = sorted[Math.floor(n * 0.33)];
    const q2 = sorted[Math.floor(n * 0.66)];
    if (price <= q1) return '#1A7F37';   // vert GitHub
    if (price <= q2) return '#D4A72C';   // ambre
    return '#CF222E';                    // rouge
  }

  function renderStations(stations, fuelLabel) {
    // Clear previous
    for (const m of stationMarkers.values()) m.remove();
    stationMarkers.clear();
    if (!stations || stations.length === 0) return;

    const prices = stations.map(s => s.price);

    for (const s of stations) {
      const color = priceColor(s.price, prices);
      const icon = L.divIcon({
        className: '',
        html: `<div class="fmp-marker" style="background:${color}"><span>${s.price.toFixed(2)}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });

      const updated = s.updated ? new Date(s.updated) : null;
      const updatedStr = updated ? updated.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) + ' ' + updated.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '—';

      const popupHtml = `
        <div class="fmp-pop-name">${escapeHtml(s.name || ('Station ' + s.id))}</div>
        <div class="fmp-pop-addr">${escapeHtml(s.address || '')}${s.city ? ', ' + escapeHtml(s.city) : ''}</div>
        <div class="fmp-pop-price" style="color:${color}">${s.price.toFixed(3)} €</div>
        <div class="fmp-pop-fuel">${escapeHtml(fuelLabel)} · ${s.distance.toFixed(1)} km</div>
        <div class="fmp-pop-time">maj ${updatedStr}</div>
      `;

      const m = L.marker([s.lat, s.lon], { icon })
        .bindPopup(popupHtml, { closeButton: false, offset: [0, -10] })
        .addTo(map);

      stationMarkers.set(s.id, m);
    }
  }

  function focusStation(station) {
    const m = stationMarkers.get(station.id);
    if (!m) return;
    map.setView([station.lat, station.lon], 14, { animate: true });
    m.openPopup();
  }

  /**
   * Abonne un callback aux clics utilisateur sur le fond de carte.
   * Les clics sur les marqueurs / popups sont automatiquement ignorés par Leaflet
   * (ils stoppent la propagation vers le conteneur de la carte).
   *
   * Le callback reçoit (lat, lon).
   */
  function onMapClick(callback) {
    if (!map) return;
    map.on('click', (e) => {
      if (typeof callback === 'function') {
        callback(e.latlng.lat, e.latlng.lng);
      }
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    init,
    getMap,
    setReference,
    renderStations,
    focusStation,
    onMapClick,
    priceColor,
  };
})();
