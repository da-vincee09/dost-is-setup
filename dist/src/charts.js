import { escapeHtml, formatCurrency, percent } from "./utils.js";

const chartInstances = new Map();

export function destroyAllCharts() {
  chartInstances.forEach((chart) => {
    try { chart.destroy(); } catch (_) { /* ignore */ }
  });
  chartInstances.clear();
}

function getOrCreate(canvasId, config) {
  if (chartInstances.has(canvasId)) {
    try { chartInstances.get(canvasId).destroy(); } catch (_) { /* ignore */ }
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const chart = new Chart(canvas, config);
  chartInstances.set(canvasId, chart);
  return chart;
}

const COLORS = {
  target: "#20bf72",
  collection: "#102c6d",
  refundPerformance: "#f59e0b",
  remaining: "#8ea1b8",
  teal: "#37a2a6",
  gridLine: "#e2e8f0",
  text: "#64748b",
  textDark: "#334155"
};

function sparseAllYearsLabel(fullLabels) {
  return (val, index) => {
    const label = fullLabels[index] || String(val);
    if (index === 0) return label;
    const parts = label.split(" ");
    const month = parts[0] || "";
    if (month === "Jan" || month === "January") {
      const year = label.match(/\d{4}/)?.[0];
      return year || label;
    }
    return "";
  };
}

function formatTickLabel(fullLabels, isAllYears) {
  if (isAllYears) return sparseAllYearsLabel(fullLabels);
  return (val, index) => fullLabels[index] || String(val);
}

function sparseAllYearsTooltip(fullLabels) {
  return (tooltipItems) => {
    const idx = tooltipItems[0]?.dataIndex;
    return fullLabels[idx] || tooltipItems[0]?.label || "";
  };
}

function percentYAxisMax(values) {
  const max = Math.max(...values.filter((v) => isFinite(v)), 0);
  if (max <= 100) return 100;
  if (max <= 200) return 200;
  if (max <= 300) return 300;
  if (max <= 500) return 500;
  return Math.ceil(max / 100) * 100;
}

export function renderLineChart(canvasId, { labels, values, legend = "", yAxisType = "currency", title = "", selectedYear = "" }) {
  const isAllYears = labels.length > 12 && !selectedYear;
  const maxVal = yAxisType === "percent" ? percentYAxisMax(values) : Math.max(...values, 1);
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: legend || title,
        data: values,
        borderColor: COLORS.collection,
        backgroundColor: COLORS.collection + "18",
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: COLORS.collection,
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        tension: 0.3,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: sparseAllYearsTooltip(labels),
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (yAxisType === "percent") return `Rate: ${v.toFixed(1)}%`;
              return `Amount: ${formatCurrency(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            maxRotation: 45,
            callback: formatTickLabel(labels, isAllYears)
          }
        },
        y: {
          beginAtZero: true,
          max: yAxisType === "percent" ? maxVal : undefined,
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            callback: (v) => yAxisType === "percent" ? `${v}%` : formatCurrency(v)
          }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  };
  return `<div class="chart-canvas-wrap"><canvas id="${escapeHtml(canvasId)}"></canvas></div>`;
}

export function initLineChart(canvasId, { labels, values, legend = "", yAxisType = "currency", title = "", selectedYear = "" }) {
  const isAllYears = labels.length > 12 && !selectedYear;
  const maxVal = yAxisType === "percent" ? percentYAxisMax(values) : Math.max(...values, 1);
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: legend || title,
        data: values,
        borderColor: COLORS.refundPerformance,
        backgroundColor: COLORS.refundPerformance + "18",
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: COLORS.refundPerformance,
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        tension: 0.3,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: sparseAllYearsTooltip(labels),
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (yAxisType === "percent") return `Rate: ${v.toFixed(1)}%`;
              return `Amount: ${formatCurrency(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            maxRotation: 45,
            callback: formatTickLabel(labels, isAllYears)
          }
        },
        y: {
          beginAtZero: true,
          max: yAxisType === "percent" ? maxVal : undefined,
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            callback: (v) => yAxisType === "percent" ? `${v}%` : formatCurrency(v)
          }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  };
  return getOrCreate(canvasId, config);
}

export function renderBarChart(canvasId, { labels, targets, actuals, legend = "", title = "", selectedYear = "" }) {
  const isAllYears = labels.length > 12 && !selectedYear;
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Target",
          data: targets,
          backgroundColor: COLORS.target,
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Collection",
          data: actuals,
          backgroundColor: COLORS.collection,
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { usePointStyle: true, pointStyle: "rectRounded", padding: 16, font: { size: 12, weight: "600" } }
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: sparseAllYearsTooltip(labels),
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            maxRotation: 45,
            callback: formatTickLabel(labels, isAllYears)
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            callback: (v) => formatCurrency(v)
          }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  };
  return `<div class="chart-canvas-wrap"><canvas id="${escapeHtml(canvasId)}"></canvas></div>`;
}

export function initBarChart(canvasId, { labels, targets, actuals, selectedYear = "" }) {
  const isAllYears = labels.length > 12 && !selectedYear;
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Target",
          data: targets,
          backgroundColor: COLORS.target,
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Collection",
          data: actuals,
          backgroundColor: COLORS.collection,
          borderRadius: 3,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: sparseAllYearsTooltip(labels),
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            maxRotation: 45,
            callback: formatTickLabel(labels, isAllYears)
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            callback: (v) => formatCurrency(v)
          }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  };
  return getOrCreate(canvasId, config);
}

export function initPerformanceChart(canvasId, { labels, values, isAllYears = false }) {
  const maxVal = percentYAxisMax(values);
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Refund Performance",
        data: values,
        borderColor: COLORS.refundPerformance,
        backgroundColor: COLORS.refundPerformance + "18",
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: COLORS.refundPerformance,
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        tension: 0.3,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: sparseAllYearsTooltip(labels),
            label: (ctx) => `Performance: ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            maxRotation: 45,
            callback: formatTickLabel(labels, isAllYears)
          }
        },
        y: {
          beginAtZero: true,
          max: maxVal,
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { size: 11, weight: "600" },
            callback: (v) => `${v}%`
          }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  };
  return getOrCreate(canvasId, config);
}

const PIE_COLORS = [
  "#102c6d",
  "#20bf72",
  "#37a2a6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
  "#f97316"
];

export function initPieChart(canvasId, { labels, values, cutout = 0, title = "" }) {
  const total = values.reduce((sum, v) => sum + Number(v || 0), 0);
  const bgColors = labels.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]);
  const config = {
    type: cutout > 0 ? "doughnut" : "pie",
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverBorderColor: "#ffffff",
        hoverBorderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: `${cutout}%`,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 14,
            font: { size: 12, weight: "600" },
            color: COLORS.textDark,
            generateLabels: (chart) => {
              const data = chart.data;
              if (!data.labels || !data.datasets.length) return [];
              const ds = data.datasets[0];
              return data.labels.map((label, i) => {
                const val = Number(ds.data[i] || 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
                return {
                  text: `${label}  ${val}  (${pct}%)`,
                  fillStyle: ds.backgroundColor[i],
                  hidden: false,
                  index: i,
                  pointStyle: "circle"
                };
              });
            }
          }
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { weight: "bold" },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const val = Number(ctx.parsed || 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return ` ${ctx.label}: ${val} (${pct}%)`;
            }
          }
        },
        datalabels: {
          color: "#fff",
          font: { weight: "bold", size: 11 },
          textShadowColor: "rgba(0,0,0,0.35)",
          textShadowBlur: 4,
          formatter: (value, ctx) => {
            const pct = total > 0 ? ((value / total) * 100) : 0;
            if (pct < 5) return "";
            const label = ctx.chart.data.labels[ctx.dataIndex] || "";
            return `${label}\n${value}\n${pct.toFixed(1)}%`;
          },
          display: (ctx) => {
            const val = Number(ctx.dataset.data[ctx.dataIndex] || 0);
            return val > 0;
          },
          textAlign: "center",
          clamp: true,
          clip: false
        }
      }
    }
  };
  return getOrCreate(canvasId, config);
}
