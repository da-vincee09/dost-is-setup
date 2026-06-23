import { statusConfig } from "./status.js";
import { escapeHtml, formatCurrency, formatDate, percent, slug } from "./utils.js";

const iconPaths = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-11h6V4h-6v5Z",
  users: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3ZM8 11c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm8 2c-2 0-6 1-6 3v2h12v-2c0-2-4-3-6-3Zm-8 0c-2.3 0-6 1.2-6 3v2h6v-2c0-1.1.6-2.1 1.6-2.9A9 9 0 0 0 8 13Z",
  cash: "M3 6h18v12H3V6Zm3 3a2 2 0 0 1-2 2v2a2 2 0 0 1 2 2h12a2 2 0 0 1 2-2v-2a2 2 0 0 1-2-2H6Zm6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6V6H9v2Zm0 4h6v-2H9v2Zm0 4h4v-2H9v2Z",
  reconcile: "M4 7h10l-2-2 1.4-1.4L18 8l-4.6 4.4L12 11l2-2H4V7Zm16 10H10l2 2-1.4 1.4L6 16l4.6-4.4L12 13l-2 2h10v2Z",
  calendar: "M7 2h2v3h6V2h2v3h3v17H4V5h3V2Zm11 9H6v9h12v-9Z",
  edit: "M4 17.5V21h3.5L18.1 10.4l-3.5-3.5L4 17.5Zm16.7-9.8c.4-.4.4-1 0-1.4l-2-2a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.5-1.7Z",
  folder: "M3 5h7l2 2h9v12H3V5Zm2 4v8h14V9H5Z",
  report: "M5 3h10l4 4v14H5V3Zm9 1.5V8h3.5L14 4.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z",
  upload: "M12 3 7 8h3v6h4V8h3l-5-5ZM5 18h14v2H5v-2Z",
  archive: "M4 4h16v4H4V4Zm2 6h12v10H6V10Zm4 3v2h4v-2h-4Z",
  settings: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm8.9 3h-2a7 7 0 0 0-.8-1.9l1.4-1.4-2.1-2.1L16 7a7 7 0 0 0-2-.8v-2h-3v2a7 7 0 0 0-2 .8L7.6 5.6 5.5 7.7l1.4 1.4A7 7 0 0 0 6.1 11h-2v3h2c.2.7.4 1.3.8 1.9l-1.4 1.4 2.1 2.1L9 18a7 7 0 0 0 2 .8v2h3v-2a7 7 0 0 0 2-.8l1.4 1.4 2.1-2.1-1.4-1.4c.4-.6.6-1.2.8-1.9h2v-3Z",
  alert: "M12 2 2 21h20L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  search: "M10 4a6 6 0 0 1 4.7 9.7l4.3 4.3-1.4 1.4-4.3-4.3A6 6 0 1 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  filter: "M4 5h16l-6 7v6l-4 2v-8L4 5Z",
  print: "M7 3h10v5H7V3Zm-2 7h14a3 3 0 0 1 3 3v5h-4v3H6v-3H2v-5a3 3 0 0 1 3-3Zm3 8v1h8v-5H8v4Z",
  download: "M11 3h2v10l4-4 1.4 1.4L12 16.8l-6.4-6.4L7 9l4 4V3ZM5 19h14v2H5v-2Z",
  menu: "M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z",
  close: "m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4Z",
  chevron: "m8 5 8 7-8 7V5Z",
  info: "M11 10h2v7h-2v-7Zm0-3h2v2h-2V7Zm1-5a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  check: "m9 16.2-4.2-4.2L3.4 13.4 9 19 21 7l-1.4-1.4L9 16.2Z",
  refresh: "M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h8V3l-3.3 3.3Z"
};

export function icon(name, label = "") {
  const path = iconPaths[name] || iconPaths.info;
  return `<svg class="icon" aria-hidden="${label ? "false" : "true"}" ${label ? `aria-label="${escapeHtml(label)}"` : ""} viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="${path}"></path></svg>`;
}

export function statusBadge(status) {
  const config = statusConfig[status] || { tone: "neutral", help: status };
  return `<span class="status-badge status-${config.tone}" title="${escapeHtml(config.help)}"><span class="status-dot"></span>${escapeHtml(status)}</span>`;
}

export function pageHeader({ title, eyebrow = "", description = "", actions = "" }) {
  return `
    <div class="page-heading">
      <div>
        ${eyebrow ? `<p class="breadcrumb">${escapeHtml(eyebrow)}</p>` : ""}
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </div>
  `;
}

function internalHref(path = "/") {
  if (!path || path.startsWith("#") || /^[a-z]+:/i.test(path)) return path || "#/";
  return `#${path.startsWith("/") ? path : `/${path}`}`;
}

export function buttonLink(path, label, iconName = "", variant = "primary") {
  return `<a class="btn btn-${variant}" href="${internalHref(path)}" data-link>${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span></a>`;
}

export function summaryCard({ label, value, context, iconName = "info", trend = "", route = "" }) {
  const content = `
    <div class="summary-icon">${icon(iconName)}</div>
    <div class="summary-copy">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(context || "")}</small>
      ${trend ? `<em>${escapeHtml(trend)}</em>` : ""}
    </div>
  `;
  if (route) return `<a class="summary-card" href="${internalHref(route)}" data-link>${content}</a>`;
  return `<article class="summary-card">${content}</article>`;
}

export function referenceKpiCard({ label, value, context = "", tone = "green", iconName = "info", route = "" }) {
  const content = `
    <div class="reference-kpi-ribbon reference-kpi-${tone}">
      ${icon(iconName)}
      <span>${escapeHtml(label)}</span>
    </div>
    <strong>${escapeHtml(value)}</strong>
    ${context ? `<small>${escapeHtml(context)}</small>` : ""}
  `;
  if (route) return `<a class="reference-kpi-card" href="${internalHref(route)}" data-link>${content}</a>`;
  return `<article class="reference-kpi-card">${content}</article>`;
}

export function emptyState(title, message, action = "") {
  return `<div class="state-card empty-state">${icon("folder")}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${action}</div>`;
}

export function errorState(message) {
  return `<div class="state-card error-state" role="alert">${icon("alert")}<h2>Something needs attention</h2><p>${escapeHtml(message)}</p></div>`;
}

export function loadingSkeleton(lines = 4) {
  return `<div class="loading-skeleton" aria-label="Loading">${Array.from({ length: lines }, () => "<span></span>").join("")}</div>`;
}

export function formSection(title, description, body) {
  return `<section class="form-section"><div class="form-section-heading"><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div><div class="form-grid">${body}</div></section>`;
}

export function field({ label, name, value = "", type = "text", required = false, placeholder = "", help = "", step = "", min = "", max = "", className = "" }) {
  return `
    <label class="field ${className}">
      <span>${escapeHtml(label)}${required ? '<b aria-label="required">*</b>' : ""}</span>
      <input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""} ${min !== "" ? `min="${min}"` : ""} ${max !== "" ? `max="${max}"` : ""} />
      ${help ? `<small>${escapeHtml(help)}</small>` : ""}
      <em class="field-error" data-error-for="${escapeHtml(name)}"></em>
    </label>
  `;
}

export function textArea({ label, name, value = "", required = false, placeholder = "", className = "" }) {
  return `
    <label class="field ${className}">
      <span>${escapeHtml(label)}${required ? '<b aria-label="required">*</b>' : ""}</span>
      <textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea>
      <em class="field-error" data-error-for="${escapeHtml(name)}"></em>
    </label>
  `;
}

export function selectField({ label, name, options, value = "", required = false, className = "" }) {
  return `
    <label class="field ${className}">
      <span>${escapeHtml(label)}${required ? '<b aria-label="required">*</b>' : ""}</span>
      <select name="${escapeHtml(name)}" ${required ? "required" : ""}>
        <option value="">Select</option>
        ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
      <em class="field-error" data-error-for="${escapeHtml(name)}"></em>
    </label>
  `;
}

export function fileUpload({ label = "Attachment", name = "attachment", help = "PDF, JPG, PNG, or WebP up to 10 MB." } = {}) {
  return `
    <label class="file-upload">
      ${icon("upload")}
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(help)}</small>
      <input type="file" name="${escapeHtml(name)}" />
      <em class="field-error" data-error-for="${escapeHtml(name)}"></em>
    </label>
  `;
}

export function searchInput(placeholder = "Search records", id = "record-search") {
  return `
    <label class="search-input" for="${escapeHtml(id)}">
      ${icon("search")}
      <input id="${escapeHtml(id)}" type="search" placeholder="${escapeHtml(placeholder)}" autocomplete="off" data-search />
      <button type="button" class="icon-btn" data-clear-search aria-label="Clear search">${icon("close")}</button>
    </label>
  `;
}

export function filterChips(filters) {
  const active = Object.entries(filters).filter(([, value]) => value);
  if (!active.length) return `<div class="filter-chips" data-filter-chips></div>`;
  return `<div class="filter-chips" data-filter-chips>${active
    .map(([key, value]) => `<button type="button" data-remove-filter="${escapeHtml(key)}">${escapeHtml(key)}: ${escapeHtml(value)}</button>`)
    .join("")}</div>`;
}

export function dataTable({ columns, rows, emptyMessage = "No records found.", className = "" }) {
  if (!rows.length) return emptyState("No records", emptyMessage);
  return `
    <div class="table-wrap ${className}" tabindex="0">
      <table class="data-table">
        <thead>
          <tr>
            ${columns
              .map(
                (column) =>
                  `<th scope="col" data-col="${escapeHtml(column.key)}">${column.sortable ? `<button type="button" data-sort="${escapeHtml(column.key)}">${escapeHtml(column.label)} ${icon("chevron")}</button>` : escapeHtml(column.label)}</th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr data-record-row data-search-text="${escapeHtml(row.searchText || "")}">${columns
                  .map((column) => `<td data-label="${escapeHtml(column.label)}" data-col="${escapeHtml(column.key)}">${column.render(row)}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function dashboardTableCard({ title, description = "", columns, rows, emptyMessage = "No dashboard data available.", className = "" }) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  return `
    <section class="panel dashboard-table-card ${className}" aria-label="${escapeHtml(title)}">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        </div>
      </div>
      ${
        hasRows
          ? `<div class="dashboard-table-wrap" tabindex="0">
              <table class="dashboard-table">
                <thead>
                  <tr>${columns
                    .map((column) => `<th scope="col" class="${column.align === "right" ? "is-right" : ""}">${escapeHtml(column.label)}</th>`)
                    .join("")}</tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) =>
                        `<tr>${columns
                          .map((column) => `<td class="${column.align === "right" ? "is-right" : ""}">${column.render ? column.render(row) : escapeHtml(row[column.key] ?? "")}</td>`)
                          .join("")}</tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="dashboard-empty">${escapeHtml(emptyMessage)}</div>`
      }
    </section>
  `;
}

export function mobileRecordCard({ title, subtitle, meta = [], status = "", actions = "", searchText = "" }) {
  return `
    <article class="mobile-record-card" data-record-card data-search-text="${escapeHtml(searchText)}">
      <div class="mobile-card-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        ${status ? statusBadge(status) : ""}
      </div>
      <dl>
        ${meta.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${item.value}</dd></div>`).join("")}
      </dl>
      ${actions ? `<div class="mobile-card-actions">${actions}</div>` : ""}
    </article>
  `;
}

function chartBars(data, valueKey = "value") {
  const max = Math.max(...data.map((item) => Number(item[valueKey] || 0)), 1);
  return `<div class="bar-chart">${data
    .map((item) => {
      const height = Math.max(6, percent(Number(item[valueKey] || 0), max));
      return `<div class="bar-item" title="${escapeHtml(item.label)}: ${escapeHtml(item[valueKey])}"><span style="height:${height}%"></span><small>${escapeHtml(String(item.label).slice(-5))}</small></div>`;
    })
    .join("")}</div>`;
}

function chartLine(data) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data
    .map((item, index) => {
      const x = 10 + index * (180 / Math.max(data.length - 1, 1));
      const y = 90 - percent(item.value, max) * 0.75;
      return `${x},${y}`;
    })
    .join(" ");
  return `<svg class="line-chart" role="img" aria-label="Line chart" viewBox="0 0 210 110"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${points
    .split(" ")
    .map((point) => {
      const [x, y] = point.split(",");
      return `<circle cx="${x}" cy="${y}" r="3"></circle>`;
    })
    .join("")}</svg>`;
}

function chartDonut(data) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  let offset = 25;
  const circles = data
    .slice(0, 5)
    .map((item, index) => {
      const length = percent(item.value, total);
      const circle = `<circle r="34" cx="50" cy="50" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}" class="donut-${index}"></circle>`;
      offset -= length;
      return circle;
    })
    .join("");
  return `<div class="donut-wrap"><svg class="donut-chart" viewBox="0 0 100 100">${circles}<text x="50" y="53">${Math.round(total)}</text></svg><ul>${data
    .slice(0, 5)
    .map((item, index) => `<li><span class="legend-dot legend-${index}"></span>${escapeHtml(item.label)} <b>${escapeHtml(item.value)}</b></li>`)
    .join("")}</ul></div>`;
}

function chartValue(value, format = "number") {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return `${Number(value || 0).toFixed(1)}%`;
  return String(Number(value || 0).toLocaleString("en-PH"));
}

function compactPeriodLabel(label = "") {
  const text = String(label);
  const yearMatch = text.match(/, (\d{4})$/);
  if (!yearMatch) return text;
  return text.replace(/, \d{4}$/, ` '${yearMatch[1].slice(-2)}`);
}

function palette(index) {
  return ["#1fbf74", "#102c6d", "#37a2a6", "#f59e0b", "#dc2626", "#64748b"][index % 6];
}

function chartLabel(value, maxLength = 28) {
  const text = String(value || "Not classified");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

export function svgChartCard({ title, description = "", data = [], valueKey = "value", format = "number", empty = "No chart data available." }) {
  const clean = data
    .filter((item) => Number(item[valueKey] || 0) > 0)
    .map((item) => ({ ...item, [valueKey]: Number(item[valueKey] || 0) }))
    .sort((left, right) => Number(right[valueKey] || 0) - Number(left[valueKey] || 0));
  const max = Math.max(...clean.map((item) => Number(item[valueKey] || 0)), 1);
  const total = clean.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0) || 1;
  const width = 680;
  const labelWidth = 170;
  const barX = 190;
  const barWidth = 330;
  const valueX = 540;
  const rowHeight = 40;
  const height = Math.max(160, 28 + clean.length * rowHeight);
  const summary = clean.length
    ? clean.map((item) => `${item.label}: ${chartValue(item[valueKey], format)}`).join("; ")
    : empty;
  return `
    <section class="panel chart-card svg-chart-card" aria-label="${escapeHtml(title)}">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        </div>
      </div>
      ${
        clean.length
          ? `<svg class="responsive-chart distribution-chart" role="img" aria-label="${escapeHtml(summary)}" viewBox="0 0 ${width} ${height}">
              <title>${escapeHtml(summary)}</title>
              ${clean
                .map((item, index) => {
                  const value = Number(item[valueKey] || 0);
                  const rowY = 18 + index * rowHeight;
                  const currentWidth = Math.max(6, (value / max) * barWidth);
                  const share = percent(value, total);
                  const label = `${item.label}: ${chartValue(value, format)} (${share.toFixed(1)}%)`;
                  return `<g tabindex="0" aria-label="${escapeHtml(label)}">
                    <title>${escapeHtml(label)}</title>
                    <text class="chart-label" x="0" y="${rowY + 17}">${escapeHtml(chartLabel(item.label, Math.floor(labelWidth / 7)))}</text>
                    <rect class="chart-track" x="${barX}" y="${rowY}" width="${barWidth}" height="18" rx="4"></rect>
                    <rect class="chart-bar" x="${barX}" y="${rowY}" width="${currentWidth.toFixed(1)}" height="18" rx="4" fill="${palette(index)}"></rect>
                    <text class="chart-value" x="${valueX}" y="${rowY + 14}">${escapeHtml(chartValue(value, format))}</text>
                  </g>`;
                })
                .join("")}
            </svg>
            <ul class="chart-breakdown">
              ${clean
                .map((item, index) => {
                  const value = Number(item[valueKey] || 0);
                  const share = percent(value, total);
                  return `<li><span><i style="background:${palette(index)}"></i>${escapeHtml(item.label)}</span><strong>${escapeHtml(chartValue(value, format))} <small>${share.toFixed(1)}%</small></strong></li>`;
                })
                .join("")}
            </ul>
            <p class="chart-summary">${escapeHtml(summary)}</p>`
          : `<div class="chart-empty">${escapeHtml(empty)}</div>`
      }
    </section>
  `;
}

export function referenceLineChart({ title, description = "", rows = [], valueKey = "actual", format = "currency", legend = "", axisY = "", axisX = "Month", rotateLabels = true, minPointWidth = 118, fitToContainer = false, empty = "No trend data available.", year = "" }) {
  const clean = rows.map((row) => ({ ...row, value: Number(row[valueKey] || 0) }));
  const hasData = clean.some((row) => row.value > 0);
  const chartId = `line-${slug(title)}-${Math.random().toString(36).slice(2, 8)}`;
  const isAllYears = clean.length > 12 && !year;
  const labels = clean.map((row) => row.shortLabel !== undefined ? row.shortLabel : compactPeriodLabel(row.displayLabel || row.label));
  const fullLabels = clean.map((row) => row.displayLabel || row.label);
  const values = clean.map((row) => row.value);
  const summary = hasData ? clean.map((row) => `${row.label}: ${chartValue(row.value, format)}`).join("; ") : empty;
  const maxVal = values.length ? Math.max(...values, 1) : 1;
  return `
    <section class="reference-panel reference-chart-panel reference-line-panel">
      <div class="reference-panel-title reference-title-green">${escapeHtml(title)}</div>
      <div class="reference-chart-copy">
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        ${legend ? `<div class="reference-legend"><span><i class="is-actual"></i> ${escapeHtml(legend)}</span></div>` : ""}
        ${hasData ? `<strong>${escapeHtml(chartValue(maxVal, format))}</strong>` : ""}
      </div>
      ${
        hasData
          ? `<div class="chart-canvas-wrap" data-chartjs="line" data-chart-id="${escapeHtml(chartId)}" data-labels='${escapeHtml(JSON.stringify(fullLabels))}' data-values='${escapeHtml(JSON.stringify(values))}' data-format="${escapeHtml(format)}" data-legend="${escapeHtml(legend || title)}" data-all-years="${isAllYears ? "1" : "0"}" data-selected-year="${escapeHtml(year)}"></div>`
          : `<div class="chart-empty">${escapeHtml(empty)}</div>`
      }
    </section>
  `;
}

export function referenceComparisonChart({ title, description = "", rows = [], axisX = "Month", rotateLabels = true, minPointWidth = 118, fitToContainer = false, hideAxisTitle = false, empty = "No comparison data available.", year = "" }) {
  const clean = rows.map((row) => ({ ...row, target: Number(row.target || 0), actual: Number(row.actual || 0) }));
  const hasData = clean.some((row) => row.target > 0 || row.actual > 0);
  const chartId = `bar-${slug(title)}-${Math.random().toString(36).slice(2, 8)}`;
  const isAllYears = clean.length > 12 && !year;
  const labels = clean.map((row) => row.shortLabel !== undefined ? row.shortLabel : compactPeriodLabel(row.displayLabel || row.label));
  const fullLabels = clean.map((row) => row.displayLabel || row.label);
  const targets = clean.map((row) => row.target);
  const actuals = clean.map((row) => row.actual);
  const summary = hasData ? `${title}: ${clean.length} monthly target and collection periods.` : empty;
  return `
    <section class="reference-panel reference-chart-panel reference-comparison-panel">
      <div class="reference-panel-title reference-title-navy">${escapeHtml(title)}</div>
      <div class="reference-chart-copy">
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        <div class="reference-legend"><span><i class="is-target"></i> Target</span><span><i class="is-actual"></i> Collection</span></div>
      </div>
      ${
        hasData
          ? `<div class="chart-canvas-wrap" data-chartjs="bar" data-chart-id="${escapeHtml(chartId)}" data-labels='${escapeHtml(JSON.stringify(fullLabels))}' data-targets='${escapeHtml(JSON.stringify(targets))}' data-actuals='${escapeHtml(JSON.stringify(actuals))}' data-all-years="${isAllYears ? "1" : "0"}" data-selected-year="${escapeHtml(year)}"></div>`
          : `<div class="chart-empty">${escapeHtml(empty)}</div>`
      }
    </section>
  `;
}

export function referenceDonutCard({ title, data = [], footer = "", empty = "No summary data available.", showValues = false }) {
  const clean = data.filter((item) => Number(item.value || 0) > 0).slice(0, 5);
  const total = clean.reduce((sum, item) => sum + Number(item.value || 0), 0);
  let offset = 25;
  const circles = clean
    .map((item, index) => {
      const length = percent(Number(item.value || 0), total || 1);
      const circle = `<circle r="38" cx="52" cy="52" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}" stroke="${palette(index)}"></circle>`;
      offset -= length;
      return circle;
    })
    .join("");
  return `
    <section class="reference-panel reference-small-panel">
      <h2>${escapeHtml(title)}</h2>
      ${
        total
          ? `<div class="reference-donut-wrap">
              <svg class="reference-donut" viewBox="0 0 104 104" role="img" aria-label="${escapeHtml(clean.map((item) => `${item.label}: ${item.value}`).join("; "))}">
                <title>${escapeHtml(clean.map((item) => `${item.label}: ${item.value}`).join("; "))}</title>
                ${circles}
                <text x="52" y="56">${total}</text>
              </svg>
              <ul>${clean.map((item, index) => `<li><i style="background:${palette(index)}"></i><span>${escapeHtml(item.label)}</span>${showValues ? `<strong>${escapeHtml(chartValue(item.value, "number"))}</strong>` : ""}</li>`).join("")}</ul>
            </div>
            ${footer ? `<p class="reference-small-footer">${escapeHtml(footer)}</p>` : ""}`
          : `<div class="chart-empty">${escapeHtml(empty)}</div>`
      }
    </section>
  `;
}

export function collectionPerformanceChart(rows = [], year = "") {
  const hasData = rows.some((row) => Number(row.target || 0) > 0 || Number(row.actual || 0) > 0);
  if (!hasData) {
    return `<section class="panel chart-card performance-chart-card"><div class="panel-head"><div><h2>Monthly SETUP Refund Performance</h2><p>Collected refund divided by target refund by month.</p></div></div><div class="chart-empty">No target or collection data is available for the selected filters.</div></section>`;
  }
  const hasPerformance = rows.some((row) => Number(row.rate || 0) > 0);
  if (!hasPerformance) {
    return `
      <section class="panel chart-card performance-chart-card">
        <div class="panel-head">
          <div>
            <h2>Monthly SETUP Refund Performance</h2>
            <p>Collected refund divided by target refund, shown as a percentage.</p>
          </div>
        </div>
        <div class="chart-legend" aria-label="Chart legend">
          <span><i class="legend-rate"></i>Refund Performance</span>
        </div>
        <div class="chart-empty compact-chart-empty">No collected refund recorded for the selected period.</div>
      </section>
    `;
  }
  const chartId = `perf-${Math.random().toString(36).slice(2, 8)}`;
  const isAllYears = rows.length > 12 && !year;
  const fullLabels = rows.map((row) => row.displayLabel || row.label);
  const values = rows.map((row) => Number(row.rate || 0));
  const summary = `Monthly SETUP Refund Performance: ${rows.length} monthly period${rows.length === 1 ? "" : "s"}.`;
  return `
    <section class="panel chart-card performance-chart-card" aria-label="Monthly SETUP Refund Performance">
      <div class="panel-head">
        <div>
          <h2>Monthly SETUP Refund Performance</h2>
          <p>Collected refund divided by target refund, shown as a percentage.</p>
        </div>
      </div>
      <div class="chart-legend" aria-label="Chart legend">
        <span><i class="legend-rate"></i>Refund Performance</span>
      </div>
      <div class="chart-canvas-wrap" data-chartjs="performance" data-chart-id="${escapeHtml(chartId)}" data-labels='${escapeHtml(JSON.stringify(fullLabels))}' data-values='${escapeHtml(JSON.stringify(values))}' data-all-years="${isAllYears ? "1" : "0"}" data-selected-year="${escapeHtml(year)}"></div>
      <p class="chart-summary">${escapeHtml(summary)} Hover a point to view exact collected refund, target refund, and performance.</p>
    </section>
  `;
}

export function chartCard({ title, description, data, type = "bar", empty = "No chart data available.", valueKey = "value" }) {
  const hasData = data && data.some((item) => Number(item[valueKey] || item.value || 0) > 0);
  const chart =
    !hasData
      ? `<div class="chart-empty">${escapeHtml(empty)}</div>`
      : type === "line"
        ? chartLine(data)
        : type === "donut"
          ? chartDonut(data)
          : chartBars(data, valueKey);
  return `
    <section class="panel chart-card" aria-label="${escapeHtml(title)}">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        </div>
      </div>
      ${chart}
    </section>
  `;
}

export function reportPreview(title, filters, rows) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return `
    <section class="report-preview">
      <div class="print-header">
        <strong data-print-org>DOST IS SETUP PROJECTS</strong>
        <span data-print-address>Provincial Science and Technology Office - Ilocos Sur</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${Object.entries(filters)
          .filter(([, value]) => value)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" | ")}</p>
        <p>Generated ${formatDate(new Date().toISOString().slice(0, 10))}</p>
      </div>
      ${
        rows.length
          ? dataTable({
              columns: columns.map((key) => ({ key: slug(key), label: key, render: (row) => escapeHtml(row[key]) })),
              rows: rows.map((row) => ({ ...row, searchText: Object.values(row).join(" ") }))
            })
          : emptyState("No report data", "Adjust the filters or select another report.")
      }
    </section>
  `;
}
