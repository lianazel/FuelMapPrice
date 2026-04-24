/* ===================================================================
 * preferences.js — Gestion centralisée des préférences utilisateur
 *
 * Principe :
 *   - Stockage "mémoire" pour la session courante (toujours actif)
 *   - Stockage "localStorage" si et seulement si l'utilisateur consent
 *     explicitement (via le toggle "Mémoriser sur cet appareil")
 *   - API simple : get / set / onChange / clear
 *
 * C'est aussi la brique de base pour les futures évolutions :
 *   - Favoris stations
 *   - Dernière recherche
 *   - Carburant / rayon préférés
 *   - Export / import JSON
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Prefs = (function () {

  const STORAGE_KEY   = 'fmp.prefs';       // clé localStorage racine
  const CONSENT_KEY   = 'fmp.consent';     // clé du consentement

  // Valeurs par défaut des préférences connues.
  // Toute nouvelle préférence doit être déclarée ici pour être gérée.
  const DEFAULTS = Object.freeze({
    autocomplete: true,   // suggestions intelligentes de villes (Nominatim)
    // Réservé pour la suite :
    // favoriteFuel: 'SP95',
    // defaultRadius: 10,
    // lastCity: 'Paris',
  });

  // État en mémoire (toujours la source de vérité pour la session en cours)
  let prefs = { ...DEFAULTS };

  // Consentement à la persistance dans localStorage ; OFF par défaut (opt-in RGPD-friendly)
  let persist = false;

  // Liste des callbacks enregistrés via onChange
  const listeners = new Set();

  /**
   * Charge les préférences depuis localStorage si le consentement a été donné
   * lors d'une session précédente. Appelé une seule fois au boot de l'app.
   */
  function init() {
    try {
      const savedConsent = localStorage.getItem(CONSENT_KEY);
      persist = savedConsent === 'true';

      if (persist) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // On merge avec les defaults pour tolérer l'ajout de nouvelles prefs.
          prefs = { ...DEFAULTS, ...parsed };
        }
      }
    } catch (err) {
      // localStorage indisponible (mode privé Safari, quota, etc.) — on ignore silencieusement
      console.warn('FMP.Prefs: localStorage indisponible, mode mémoire uniquement.', err);
      persist = false;
    }
  }

  /** Récupère la valeur d'une préférence. */
  function get(key) {
    return (key in prefs) ? prefs[key] : DEFAULTS[key];
  }

  /** Retourne une copie de toutes les préférences (utile pour l'affichage). */
  function getAll() {
    return { ...prefs };
  }

  /** Définit une préférence et persiste si consentement actif. */
  function set(key, value) {
    if (!(key in DEFAULTS)) {
      console.warn(`FMP.Prefs: clé inconnue "${key}" — valeur ignorée.`);
      return;
    }
    prefs[key] = value;
    flush();
    notify(key, value);
  }

  /** Active ou désactive la persistance sur cet appareil. */
  function setPersist(enabled) {
    persist = !!enabled;
    try {
      if (persist) {
        localStorage.setItem(CONSENT_KEY, 'true');
        flush(); // écrit l'état actuel
      } else {
        // Désactivation : on efface tout pour être propre
        localStorage.removeItem(CONSENT_KEY);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('FMP.Prefs: écriture localStorage impossible.', err);
    }
    notify('_persist', persist);
  }

  /** Vérifie si la persistance est active. */
  function isPersisted() {
    return persist;
  }

  /** Efface les préférences locales ET le consentement. */
  function clear() {
    prefs = { ...DEFAULTS };
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CONSENT_KEY);
    } catch {}
    persist = false;
    notify('_clear', null);
  }

  /**
   * Abonne un callback aux changements de préférence.
   * Le callback reçoit (key, value).
   */
  function onChange(callback) {
    if (typeof callback === 'function') listeners.add(callback);
    return () => listeners.delete(callback); // fonction de désinscription
  }

  // ------------------------------------------------------------------
  // Internes
  // ------------------------------------------------------------------

  function flush() {
    if (!persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn('FMP.Prefs: flush localStorage échoué.', err);
    }
  }

  function notify(key, value) {
    for (const cb of listeners) {
      try { cb(key, value); } catch (e) { console.error(e); }
    }
  }

  return {
    init,
    get,
    getAll,
    set,
    setPersist,
    isPersisted,
    clear,
    onChange,
    DEFAULTS,
  };
})();
