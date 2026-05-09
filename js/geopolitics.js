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

  // Mots-clés pour filtrer les actus énergie/pétrole (GDELT comprend le français)
  const NEWS_QUERY = '(petrole OR pétrole OR "crude oil" OR "prix carburant" OR OPEP OR OPEC OR Brent OR "gas prices" OR énergie OR "oil prices")';

  let _oilChart = null;  // instance Chart.js

  // ------------------------------------------------------------------
  // Cours du pétrole
  // ------------------------------------------------------------------

  async function loadOilPrices() {
    try {
      const res = await fetch(OIL_PRICES_URL, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
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

  async function loadNews(maxArticles = 15) {
    try {
      const url = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc&sourcelang=fre`;
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback : essayer aussi en anglais
        const urlEn = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc`;
        const resEn = await fetch(urlEn);
        if (!resEn.ok) return [];
        const dataEn = await resEn.json();
        return formatArticles(dataEn);
      }
      const data = await res.json();
      const articles = formatArticles(data);
      // Si peu de résultats FR, compléter avec EN
      if (articles.length < 5) {
        const urlEn = `${GDELT_BASE}?query=${encodeURIComponent(NEWS_QUERY)}&mode=artlist&maxrecords=${maxArticles}&format=json&sort=datedesc`;
        try {
          const resEn = await fetch(urlEn);
          if (resEn.ok) {
            const dataEn = await resEn.json();
            const enArticles = formatArticles(dataEn);
            // Fusionner sans doublons (par URL)
            const urls = new Set(articles.map(a => a.url));
            for (const a of enArticles) {
              if (!urls.has(a.url) && articles.length < maxArticles) {
                articles.push(a);
                urls.add(a.url);
              }
            }
          }
        } catch {}
      }
      return articles;
    } catch (e) {
      console.warn('FMP.Geo: GDELT indisponible.', e);
      return [];
    }
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
