/* ===================================================================
 * trends.js — Graphiques de tendances (Chart.js)
 * =================================================================== */

window.FMP = window.FMP || {};

FMP.Trends = (function () {

  let chart = null;

  const FUEL_COLORS = {
    SP95:   '#2196F3',
    SP98:   '#9C27B0',
    Gazole: '#B8860B',
    E10:    '#4CAF50',
    E85:    '#FF9800',
    GPLc:   '#F44336',
  };

  /**
   * Détecte le mode sombre pour adapter les couleurs du graphique.
   */
  function themeColors() {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? {
      grid:   '#2A2F2C',
      axis:   '#A9A9A1',
      faint:  '#6E6E66',
      ink:    '#ECE9E0',
      tooltipBg: '#161C19',
    } : {
      grid:   '#E8E2D7',
      axis:   '#52524E',
      faint:  '#A8A59E',
      ink:    '#0F0F0E',
      tooltipBg: '#0F0F0E',
    };
  }

  /**
   * history = {
   *   days: [
   *     { date: '2026-04-01', avg: { SP95: 1.82, SP98: 1.91, ... } },
   *     ...
   *   ]
   * }
   */
  function render(canvasId, history, fuelSelection, periodDays) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (!history || !history.days || history.days.length === 0) {
      // message d'état déjà géré côté HTML : on détruit juste l'éventuel chart
      if (chart) { chart.destroy(); chart = null; }
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#A8A59E';
      ctx.font = '14px "Instrument Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Données historiques en cours de constitution…', canvas.width / 2, canvas.height / 2);
      ctx.restore();
      return null;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(periodDays, 10));
    const filtered = history.days
      .filter(d => new Date(d.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    const labels = filtered.map(d => d.date);
    const fuelsToShow = fuelSelection === 'Tous'
      ? ['SP95', 'SP98', 'Gazole', 'E10', 'E85', 'GPLc']
      : [fuelSelection];

    const datasets = fuelsToShow.map(f => {
      const color = FUEL_COLORS[f] || '#52524E';
      return {
        label: f,
        data: filtered.map(d => (d.avg && d.avg[f] != null) ? d.avg[f] : null),
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        spanGaps: true,
        fill: fuelsToShow.length === 1,
      };
    });

    if (chart) chart.destroy();

    const c = themeColors();

    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, usePointStyle: true,
              font: { family: '"Instrument Sans", sans-serif', size: 12 },
              color: c.axis,
            }
          },
          tooltip: {
            backgroundColor: c.tooltipBg,
            titleFont: { family: '"Instrument Sans", sans-serif', weight: '600' },
            bodyFont:  { family: '"JetBrains Mono", monospace', size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}  ${ctx.parsed.y?.toFixed(3)} €/L`,
            }
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: c.faint,
              font: { family: '"JetBrains Mono", monospace', size: 10 },
              maxRotation: 0,
              autoSkipPadding: 20,
              callback: function(value) {
                const d = new Date(labels[value]);
                return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
              }
            }
          },
          y: {
            grid: { color: c.grid },
            ticks: {
              color: c.axis,
              font: { family: '"JetBrains Mono", monospace', size: 11 },
              callback: (v) => v.toFixed(2) + ' €',
            }
          }
        }
      }
    });

    return chart;
  }

  function computeKpis(history, fuelSelection, periodDays) {
    if (!history || !history.days) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(periodDays, 10));
    const filtered = history.days.filter(d => new Date(d.date) >= cutoff);

    const values = [];
    const fuels = fuelSelection === 'Tous' ? Object.keys(FUEL_COLORS) : [fuelSelection];
    for (const d of filtered) {
      for (const f of fuels) {
        const v = d.avg && d.avg[f];
        if (v != null) values.push(v);
      }
    }
    if (values.length === 0) return [
      { label: 'Période', value: '—', hint: 'données insuffisantes' }
    ];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Tendance : derniers 7 j vs 7 j précédents
    const last7 = filtered.slice(-7).flatMap(d => fuels.map(f => d.avg?.[f]).filter(v => v != null));
    const prev7 = filtered.slice(-14, -7).flatMap(d => fuels.map(f => d.avg?.[f]).filter(v => v != null));
    let trendHint = '—';
    let trendArrow = '→';
    if (last7.length && prev7.length) {
      const a = last7.reduce((x, y) => x + y, 0) / last7.length;
      const b = prev7.reduce((x, y) => x + y, 0) / prev7.length;
      const delta = a - b;
      const pct = (delta / b) * 100;
      trendArrow = delta > 0.005 ? '↗' : delta < -0.005 ? '↘' : '→';
      trendHint = `${delta >= 0 ? '+' : ''}${pct.toFixed(2)} % vs sem. précédente`;
    }

    return [
      { label: 'Prix moyen', value: avg.toFixed(3) + ' €', hint: `sur ${periodDays} jours` },
      { label: 'Prix minimum', value: min.toFixed(3) + ' €', hint: 'meilleur relevé' },
      { label: 'Prix maximum', value: max.toFixed(3) + ' €', hint: 'relevé le plus cher' },
      { label: 'Tendance', value: trendArrow, hint: trendHint },
    ];
  }

  return { render, computeKpis, FUEL_COLORS };
})();
