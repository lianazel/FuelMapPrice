/* ===================================================================
 * geopolitics.js — Contexte géopolitique : actus énergie + cours pétrole
 *
 * Sources :
 *   - GDELT DOC 2.0 API (actus) — gratuit, sans clé, CORS OK
 *   - data/oil-prices.json (cours Brent/WTI) — généré par la GitHub Action
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Geo = (function () {

  const OIL_PRICES_URL = 'data/oil-prices.json';
  const GDELT_BASE     = 'https://api.gdeltproject.org/api/v2/doc/doc';

  // Mots-clés pour filtrer les actus énergie/pétrole
  // Note : on évite les accents dans la query GDELT (encodage instable selon navigateur)
  const NEWS_QUERY_FR  = '(petrole OR "prix carburant" OR OPEP OR Brent OR "cours petrole" OR "prix essence" OR OPEC OR carburant)';
  const NEWS_QUERY_ALL = '("crude oil" OR OPEC OR Brent OR "oil prices" OR "gas prices" OR "oil market" OR petroleum OR "energy crisis")';

  let _oilChart = null;  // instance Chart.js

  // ------------------------------------------------------------------
  // Cours du pétrole
  // ------------------------------------------------------------------

  async function loadOilPrices() {
    try {
      const res = await fetch(OIL_PRICES_URL, { cache: 'no-cache' });
      if (!res.ok) {
        console.warn(`FMP.Geo: oil-prices.json HTTP ${res.status} — le fichier n'a peut-être pas encore été généré par l'Action GitHub.`);
        return null;
      }
      const data = await res.json();
      if (!data || !data.days || data.days.length === 0) {
        console.warn('FMP.Geo: oil-prices.json vide ou sans données.');
        return null;
      }
      return data;
    } catch (e) {
      console.warn('FMP.Geo: oil-prices.json indisponible.', e);
      return null;
    }
  }

  /**
   * Affiche le graphique des cours Brent / WTI avec Chart.js.
   */
  function renderOilChart(canvasId, data, period) {
    if (!data || !data.days || data.days.length === 0) return;

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Filtrer selon la période choisie
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - parseInt(period));
    const days = data.days.filter(d => new Date(d.date) >= cutoff);

    if (days.length === 0) return;

    const labels = days.map(d => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    });

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#A9A9A1' : '#52524E';

    const datasets = [];

    if (days.some(d => d.brent != null)) {
      datasets.push({
        label: 'Brent (USD/baril)',
        data: days.map(d => d.brent),
        borderColor: '#E85D04',
        backgroundColor: 'rgba(232, 93, 4, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      });
    }

    if (days.some(d => d.wti != null)) {
      datasets.push({
        label: 'WTI (USD/baril)',
        data: days.map(d => d.wti),
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      });
    }

    if (datasets.length === 0) return;

    if (_oilChart) _oilChart.destroy();

    _oilChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: 'Instrument Sans', size: 12 } }
          },
          tooltip: {
            backgroundColor: isDark ? '#1F2622' : '#FFFFFF',
            titleColor: isDark ? '#ECE9E0' : '#0F0F0E',
            bodyColor: isDark ? '#A9A9A1' : '#52524E',
            borderColor: isDark ? '#2A2F2C' : '#E8E2D7',
            borderWidth: 1,
            cornerRadius: 10,
            padding: 12,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? '—'} $`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, maxTicksLimit: 10, font: { size: 11 } },
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, callback: (v) => v + ' $' },
          },
        },
      },
    });
  }

  /**
   * Calcule les KPIs des cours du pétrole (dernier prix, variation).
   */
  function oilKpis(data) {
    if (!data || !data.days || data.days.length < 2) return null;

    const days = data.days;
    const latest = days[days.length - 1];
    const prev   = days[days.length - 2];

    function variation(cur, old) {
      if (cur == null || old == null || old === 0) return null;
      return ((cur - old) / old * 100).toFixed(2);
    }

    return {
      date: latest.date,
      brent:      latest.brent,
      brentDelta: variation(latest.brent, prev.brent),
      wti:        latest.wti,
      wtiDelta:   variation(latest.wti, prev.wti),
    };
  }

  // ------------------------------------------------------------------
  // Actualités via GDELT
  // ------------------------------------------------------------------

  /**
   * Charge les actualités énergie.
   * @param {number} maxArticles  — nombre max d'articles
   * @param {boolean} intl        — true = toutes langues, false = FR + EN uniquement
   */
  async function loadNews(maxArticles = 15, intl = false) {

    // Mode international : une seule requête, toutes langues
    if (intl) {
      try {
        const url = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY_ALL)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc`;
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            return formatArticles(JSON.parse(text));
          }
        }
      } catch (e) {
        console.warn('FMP.Geo: GDELT intl échoué.', e);
      }
      return [];
    }

    // Mode FR/EN : français d'abord, compléter avec anglais si < 5
    const articles = [];
    const urls = new Set();

    // Étape 1 : articles français
    try {
      const urlFr = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY_FR)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc&sourcelang=french`;
      const resFr = await fetch(urlFr);
      if (resFr.ok) {
        const text = await resFr.text();
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          const dataFr = JSON.parse(text);
          for (const a of formatArticles(dataFr)) {
            if (!urls.has(a.url)) { articles.push(a); urls.add(a.url); }
          }
        }
      }
    } catch (e) {
      console.warn('FMP.Geo: GDELT FR échoué.', e);
    }

    // Étape 2 : compléter avec articles EN si besoin
    if (articles.length < 5) {
      try {
        const urlEn = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY_ALL)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc&sourcelang=english`;
        const resEn = await fetch(urlEn);
        if (resEn.ok) {
          const text = await resEn.text();
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            const dataEn = JSON.parse(text);
            for (const a of formatArticles(dataEn)) {
              if (!urls.has(a.url) && articles.length < maxArticles) {
                articles.push(a); urls.add(a.url);
              }
            }
          }
        }
      } catch (e) {
        console.warn('FMP.Geo: GDELT EN échoué.', e);
      }
    }

    return articles;
  }

  function formatArticles(gdeltData) {
    if (!gdeltData || !gdeltData.articles) return [];
    return gdeltData.articles.map(a => ({
      title:    a.title || 'Sans titre',
      url:      a.url || '#',
      source:   a.domain || extractDomain(a.url),
      date:     a.seendate ? parseGdeltDate(a.seendate) : null,
      language: a.language || '?',
      image:    a.socialimage || null,
    }));
  }

  function parseGdeltDate(dateStr) {
    // GDELT format: "20260509T120000Z" ou ISO
    if (!dateStr) return null;
    try {
      if (dateStr.length === 16 && dateStr[8] === 'T') {
        const y = dateStr.slice(0, 4);
        const m = dateStr.slice(4, 6);
        const d = dateStr.slice(6, 8);
        const h = dateStr.slice(9, 11);
        const mn = dateStr.slice(11, 13);
        return new Date(`${y}-${m}-${d}T${h}:${mn}:00Z`);
      }
      return new Date(dateStr);
    } catch { return null; }
  }

  function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
  }

  return {
    loadOilPrices,
    renderOilChart,
    oilKpis,
    loadNews,
  };
})();
