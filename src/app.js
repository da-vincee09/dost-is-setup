import {
  adjustmentService,
  beneficiaryService,
  calculateAge,
  collectionService,
  dashboardService,
  defermentService,
  documentService,
  getCooperatorView,
  employeeService,
  getEnterpriseClassification,
  getEmployeeFullName,
  getBeneficiaryFinancials,
  getMunicipalityDistrict,
  getRefundMonthCount,
  getSchedule,
  getSeniorCitizenClassification,
  getPhaseFinancials,
  getPhaseRefundSchedule,
  formatSetupPhaseRemarks,
  importService,
  isRefundApplicableToPhase,
  lookups,
  parseSetupPhaseRemarks,
  receiptService,
  reconciliationService,
  reportService,
  salesMonitoringService,
  setupPhasePaymentKey,
  setupPhaseOptions,
  settingsService
} from "./services.js";
import {
  buttonLink,
  collectionPerformanceChart,
  dataTable,
  dashboardTableCard,
  emptyState,
  errorState,
  field,
  fileUpload,
  filterChips,
  formSection,
  icon,
  mobileRecordCard,
  pageHeader,
  referenceComparisonChart,
  referenceDonutCard,
  referenceKpiCard,
  referenceLineChart,
  reportPreview,
  searchInput,
  selectField,
  statusBadge,
  summaryCard,
  svgChartCard,
  textArea
} from "./components.js";
import {
  createConfirmToast,
  createToast,
  addMonths,
  dateAfter,
  debounce,
  downloadCsv,
  downloadJson,
  downloadPdf,
  downloadXlsx,
  escapeHtml,
  focusFirstError,
  formatCurrency,
  formatDate,
  isValidDate,
  percent,
  readForm,
  setFieldErrors,
  slug,
  todayIso,
  toNumber,
  validateEmail,
  validatePhone
} from "./utils.js";
import { repository } from "./repository.js";
import {
  getMunicipalityCoordinates,
  getMunicipalityDistrictName,
  ilocosSurBounds,
  municipalityMapBounds,
  municipalityMapPoints,
  noMunicipalityLabel,
  normalizeMunicipality
} from "./mapConfig.js";
import { destroyAllCharts, initBarChart, initLineChart, initPerformanceChart, initPieChart } from "./charts.js";

const app = document.querySelector("#app");
const APP_NAME = "DOST IS SETUP PROJECTS";
const APP_SUBTITLE = "Cooperator, Services, and Refund Collection Monitoring";
const navItems = [
  { group: "Overview", label: "Dashboard", path: "/", iconName: "dashboard" },
  { group: "SETUP", label: "Cooperators", path: "/beneficiaries", iconName: "users" },
  { group: "SETUP", label: "Project Map", path: "/setup/project-map", iconName: "dashboard" },
  { group: "Monitoring and Evaluation", label: "SETUP Refund", path: "/setup-refund", iconName: "dashboard" },
  { group: "Monitoring and Evaluation", label: "Status Report PIS", path: "/status-report-pis", iconName: "report" },
  { group: "Monitoring and Evaluation", label: "KPI", path: "/kpi", iconName: "check" },
  { group: "Monitoring and Evaluation", label: "Sales Monitoring", path: "/sales-monitoring", iconName: "cash" },
  { group: "Monitoring and Evaluation", label: "Employee Monitoring", path: "/employees", iconName: "users" },
  { group: "Transactions", label: "Collections", path: "/collections", iconName: "cash" },
  { group: "Transactions", label: "Official Receipts", path: "/receipts", iconName: "receipt" },
  { group: "Transactions", label: "Reconciliation", path: "/reconciliation", iconName: "reconcile" },
  { group: "Transactions", label: "Deferments", path: "/deferments", iconName: "calendar" },
  { group: "Transactions", label: "Account Adjustments", path: "/adjustments", iconName: "edit" },
  { group: "Records", label: "Documents", path: "/documents", iconName: "folder" },
  { group: "Records", label: "Reports", path: "/reports", iconName: "report" },
  { group: "Records", label: "Data Import", path: "/import", iconName: "upload" },
  { group: "Records", label: "Archived Records", path: "/archived", iconName: "archive" },
  { group: "System", label: "Settings", path: "/settings", iconName: "settings" }
];

const uiState = {
  sidebarCollapsed: false,
  importStep: 1,
  importPayload: null,
  escapeBound: false
};

const leafletAssets = {
  css: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  js: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
};
let leafletLoadPromise = null;

window.__dirtyForm = false;

function normalizeRoutePath(path) {
  const hashPath = String(path || "").startsWith("#") ? String(path).slice(1) : path;
  const [pathPart, queryPart = ""] = String(hashPath || "/").split("?");
  const cleanPath = String(pathPart || "/").replace(/\/+$/, "") || "/";
  if (cleanPath === "/index.html" || cleanPath === "/dist" || cleanPath === "/dist/index.html") return "/";
  return `${cleanPath}${queryPart ? `?${queryPart}` : ""}`;
}

function currentRoutePath() {
  return normalizeRoutePath(location.hash?.startsWith("#/") ? location.hash.slice(1) : `${location.pathname}${location.search}`).split("?")[0];
}

function routeHref(path) {
  return `#${normalizeRoutePath(path)}`;
}

function routeMatcher(path) {
  const cleanPath = normalizeRoutePath(path).split("?")[0];
  const matchers = [
    [/^\/$/, () => ({ title: "Dashboard", render: renderDashboard, bind: bindDashboard })],
    [/^\/setup\/project-map$/, () => ({ title: "Project Map", render: renderProjectMap, bind: bindProjectMap })],
    [/^\/setup-refund$/, () => ({ title: "SETUP Refund", render: renderSetupRefundDashboard, bind: bindSetupRefundDashboard })],
    [/^\/status-report-pis$/, () => ({ title: "Status Report PIS", render: renderStatusReportPis, bind: bindStatusReportPis })],
    [/^\/kpi$/, () => ({ title: "KPI", render: renderKpiPage, bind: bindKpiPage })],
    [/^\/sales-monitoring$/, () => ({ title: "Sales Monitoring", render: renderSalesMonitoring, bind: bindSalesMonitoring })],
    [/^\/sales-monitoring\/new$/, () => ({ title: "Add Sales Record", render: () => renderSalesMonitoringForm(), bind: bindSalesMonitoringForm })],
    [/^\/sales-monitoring\/([^/]+)\/edit$/, (id) => ({ title: "Edit Sales Record", render: () => renderSalesMonitoringForm(id), bind: () => bindSalesMonitoringForm(id) })],
    [/^\/employees$/, () => ({ title: "Employee Monitoring", render: renderEmployees, bind: bindEmployees })],
    [/^\/beneficiaries$/, () => ({ title: "Cooperators", render: renderBeneficiaries, bind: bindBeneficiaries })],
    [/^\/beneficiaries\/new$/, () => ({ title: "Add Cooperator", render: () => renderBeneficiaryForm(), bind: bindBeneficiaryForm })],
    [/^\/beneficiaries\/([^/]+)\/edit$/, (id) => ({ title: "Edit Cooperator", render: () => renderBeneficiaryForm(id), bind: () => bindBeneficiaryForm(id) })],
    [/^\/beneficiaries\/([^/]+)$/, (id) => ({ title: "Cooperator Profile", render: () => renderBeneficiaryDetail(id), bind: () => bindBeneficiaryDetail(id) })],
    [/^\/collections$/, () => ({ title: "Collections", render: renderCollections, bind: bindCollections })],
    [/^\/collections\/new$/, () => ({ title: "Record Payment", render: renderPaymentForm, bind: bindPaymentForm })],
    [/^\/collections\/([^/]+)\/edit$/, (id) => ({ title: "Edit Payment", render: () => renderPaymentEditForm(id), bind: () => bindPaymentEditForm(id) })],
    [/^\/collections\/([^/]+)$/, (id) => ({ title: "Payment Detail", render: () => renderPaymentDetail(id), bind: bindPaymentDetail })],
    [/^\/receipts$/, () => ({ title: "Official Receipts", render: renderReceipts, bind: bindReceipts })],
    [/^\/receipts\/new$/, () => ({ title: "Record Official Receipt", render: renderReceiptForm, bind: bindReceiptForm })],
    [/^\/reconciliation$/, () => ({ title: "Reconciliation", render: renderReconciliation, bind: bindReconciliation })],
    [/^\/deferments$/, () => ({ title: "Deferments", render: renderDeferments, bind: bindDeferments })],
    [/^\/deferments\/new$/, () => ({ title: "Add Deferment", render: renderDefermentForm, bind: bindDefermentForm })],
    [/^\/adjustments$/, () => ({ title: "Account Adjustments", render: renderAdjustments, bind: bindAdjustments })],
    [/^\/adjustments\/new$/, () => ({ title: "Create Adjustment", render: renderAdjustmentForm, bind: bindAdjustmentForm })],
    [/^\/documents$/, () => ({ title: "Documents", render: renderDocuments, bind: bindDocuments })],
    [/^\/reports$/, () => ({ title: "Reports", render: renderReports, bind: bindReports })],
    [/^\/import$/, () => ({ title: "Data Import", render: renderImport, bind: bindImport })],
    [/^\/archived$/, () => ({ title: "Archived Records", render: renderArchived, bind: bindArchived })],
    [/^\/settings$/, () => ({ title: "Settings", render: renderSettings, bind: bindSettings })]
  ];
  for (const [regex, factory] of matchers) {
    const match = cleanPath.match(regex);
    if (match) return factory(...match.slice(1));
  }
  return { title: "Page Not Found", render: renderNotFound, bind: () => {} };
}

async function navigate(path) {
  if (window.__dirtyForm) {
    const confirmed = await confirmAction("You have unsaved changes. Leave this page?", {
      title: "Cancel changes?",
      confirmLabel: "Leave",
      cancelLabel: "Stay"
    });
    if (!confirmed) return;
  }
  window.__dirtyForm = false;
  location.hash = normalizeRoutePath(path);
  renderApp();
}

function confirmAction(message, options = {}) {
  return createConfirmToast(message, {
    title: options.title || "Please confirm",
    confirmLabel: options.confirmLabel || "Confirm",
    cancelLabel: options.cancelLabel || "Cancel",
    type: options.type || "warning"
  });
}

function navigationMarkup() {
  let currentGroup = "";
  return navItems
    .map((item) => {
      const currentPath = currentRoutePath();
      const active = currentPath === item.path || (item.path !== "/" && currentPath.startsWith(item.path));
      const groupLabel = item.group !== currentGroup ? `<p class="nav-group">${escapeHtml(item.group)}</p>` : "";
      currentGroup = item.group;
      return `${groupLabel}<a class="${active ? "active" : ""}" href="${routeHref(item.path)}" data-link>${icon(item.iconName)}<span>${escapeHtml(item.label)}</span></a>`;
    })
    .join("");
}

function sidebarMarkup() {
  return `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-lockup">
        <span class="brand-mark">DOST</span>
        <div>
          <strong>${APP_NAME}</strong>
          <small>${APP_SUBTITLE}</small>
        </div>
      </div>
      <nav>
        ${navigationMarkup()}
      </nav>
      <button class="sidebar-toggle" type="button" data-action="toggle-sidebar">${icon("chevron")}<span>Collapse</span></button>
    </aside>
  `;
}

function mobileDrawerMarkup() {
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="mobile-drawer" aria-label="Mobile navigation">
      <div class="drawer-head">
        <strong>${APP_NAME}</strong>
        <button class="icon-btn" type="button" data-action="close-drawer" aria-label="Close navigation">${icon("close")}</button>
      </div>
      <nav>
        ${navigationMarkup()}
      </nav>
    </aside>
  `;
}

function getAttentionCount() {
  const state = repository.getSnapshot();
  const asOf = todayIso();
  const receiptPaymentIds = new Set(state.receipts.filter((receipt) => !receipt.archived).map((receipt) => receipt.paymentId));
  const missingReceipts = state.payments.filter((payment) => !payment.archived && !["Pending", "Returned", "Replaced", "Cancelled"].includes(payment.status) && !receiptPaymentIds.has(payment.id)).length;
  const pdcSoon = state.payments.filter((payment) => {
    if (payment.archived || payment.method !== "PDC" || !payment.checkDate) return false;
    if (["Returned", "Replaced", "Cancelled"].includes(payment.status)) return false;
    if (payment.paymentDate > asOf) return false;
    const days = Math.round((new Date(`${payment.checkDate}T00:00:00`) - new Date(`${asOf}T00:00:00`)) / 86400000);
    return days >= 0 && days <= 14;
  }).length;
  return missingReceipts + pdcSoon;
}

function renderShell(route) {
  return `
    <div class="app-shell ${uiState.sidebarCollapsed ? "is-collapsed" : ""}">
      ${sidebarMarkup()}
      ${mobileDrawerMarkup()}
      <div class="app-main">
        <header class="topbar">
          <button class="icon-btn menu-button" type="button" data-action="open-drawer" aria-label="Open navigation">${icon("menu")}</button>
          <div class="topbar-title">
            <span>${APP_SUBTITLE}</span>
            <strong>${escapeHtml(route.title)}</strong>
          </div>
          <div class="topbar-actions">
            ${buttonLink("/beneficiaries/new", "Add Cooperator", "plus", "primary")}
          </div>
        </header>
        <main id="main-content" tabindex="-1">${route.render()}</main>
      </div>
      <div class="toast-region" data-toast-region aria-live="polite"></div>
    </div>
  `;
}

function renderApp() {
  try {
    destroyAllCharts();
    const route = routeMatcher(currentRoutePath());
    document.title = `${route.title} | ${APP_NAME}`;
    app.innerHTML = renderShell(route);
    bindShell();
    route.bind?.();
    bindChartjsCharts();
    document.querySelector("#main-content")?.focus({ preventScroll: true });
  } catch (error) {
    console.error("Module render failed:", error);
    document.title = `Module Error | ${APP_NAME}`;
    app.innerHTML = `
      <div class="app-shell ${uiState.sidebarCollapsed ? "is-collapsed" : ""}">
        ${sidebarMarkup()}
        ${mobileDrawerMarkup()}
        <div class="app-main">
          <header class="topbar">
            <button class="icon-btn menu-button" type="button" data-action="open-drawer" aria-label="Open navigation">${icon("menu")}</button>
            <div class="topbar-title">
              <span>${APP_SUBTITLE}</span>
              <strong>Module Error</strong>
            </div>
          </header>
          <main id="main-content" tabindex="-1">${errorState("This module could not be displayed because one or more database records are incomplete or invalid. Check the browser console for the exact record error.")}</main>
        </div>
        <div class="toast-region" data-toast-region aria-live="polite"></div>
      </div>
    `;
    bindShell();
  }
}

function bindShell() {
  app.querySelectorAll("[data-action='toggle-sidebar']").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.sidebarCollapsed = !uiState.sidebarCollapsed;
      app.querySelector(".app-shell")?.classList.toggle("is-collapsed", uiState.sidebarCollapsed);
    });
  });
  app.querySelectorAll("[data-action='open-drawer']").forEach((button) => {
    button.addEventListener("click", () => app.querySelector(".app-shell")?.classList.add("drawer-open"));
  });
  app.querySelectorAll("[data-action='close-drawer']").forEach((button) => {
    button.addEventListener("click", () => app.querySelector(".app-shell")?.classList.remove("drawer-open"));
  });
  app.querySelectorAll(".mobile-drawer [data-link]").forEach((link) => {
    link.addEventListener("click", () => app.querySelector(".app-shell")?.classList.remove("drawer-open"));
  });
  if (!uiState.escapeBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") app.querySelector(".app-shell")?.classList.remove("drawer-open");
    });
    uiState.escapeBound = true;
  }
}

function bindChartjsCharts(root = document) {
  root.querySelectorAll("[data-chartjs]").forEach((el) => {
    const type = el.dataset.chartjs;
    const chartId = el.dataset.chartId;
    if (!chartId) return;
    if (!el.querySelector("canvas")) {
      const canvas = document.createElement("canvas");
      canvas.id = chartId;
      el.appendChild(canvas);
    }
    try {
      const labels = JSON.parse(el.dataset.labels || "[]");
      const selectedYear = el.dataset.selectedYear || "";
      if (type === "line") {
        const values = JSON.parse(el.dataset.values || "[]");
        const format = el.dataset.format || "currency";
        const legend = el.dataset.legend || "";
        initLineChart(chartId, { labels, values, legend, yAxisType: format === "percent" ? "percent" : "currency", selectedYear });
      } else if (type === "bar") {
        const targets = JSON.parse(el.dataset.targets || "[]");
        const actuals = JSON.parse(el.dataset.actuals || "[]");
        initBarChart(chartId, { labels, targets, actuals, selectedYear });
      } else if (type === "performance") {
        const values = JSON.parse(el.dataset.values || "[]");
        const isAllYears = el.dataset.allYears === "1";
        initPerformanceChart(chartId, { labels, values, isAllYears });
      } else if (type === "pie") {
        const values = JSON.parse(el.dataset.values || "[]");
        const cutout = Number(el.dataset.cutout || 0);
        initPieChart(chartId, { labels, values, cutout });
      }
    } catch (err) {
      console.warn("Chart.js init failed:", type, chartId, err);
    }
  });
}

function bindTableSorts(root = document) {
  root.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const table = button.closest("table");
      const key = button.dataset.sort;
      const header = button.closest("th");
      const index = [...header.parentElement.children].indexOf(header);
      const rows = [...table.tBodies[0].rows];
      const direction = button.dataset.direction === "asc" ? "desc" : "asc";
      button.dataset.direction = direction;
      rows
        .sort((a, b) => {
          const left = a.cells[index].textContent.trim();
          const right = b.cells[index].textContent.trim();
          return direction === "asc" ? left.localeCompare(right, undefined, { numeric: true }) : right.localeCompare(left, undefined, { numeric: true });
        })
        .forEach((row) => table.tBodies[0].append(row));
    });
  });
}

function bindSearch(root = document) {
  const input = root.querySelector("[data-search]");
  if (!input) return;
  const apply = () => {
    const term = input.value.trim().toLowerCase();
    root.querySelectorAll("[data-record-row], [data-record-card]").forEach((node) => {
      const haystack = node.dataset.searchText?.toLowerCase() || node.textContent.toLowerCase();
      node.hidden = term && !haystack.includes(term);
    });
    const visibleCount = [...root.querySelectorAll("[data-record-row], [data-record-card]")].filter((node) => !node.hidden).length;
    root.querySelector("[data-visible-count]")?.replaceChildren(document.createTextNode(String(visibleCount)));
  };
  input.addEventListener("input", debounce(apply, 120));
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    input.value = "";
    input.focus();
    apply();
  });
}

function bindDirtyForm(form) {
  if (!form) return;
  window.__dirtyForm = false;
  form.addEventListener("input", () => {
    window.__dirtyForm = true;
  });
  form.addEventListener("submit", async (event) => {
    if (form.dataset.confirmedSubmit === "true") {
      delete form.dataset.confirmedSubmit;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const submitter = event.submitter;
    const submitText = `${submitter?.textContent || submitter?.value || ""}`.trim();
    const isUpdate = /update|edit/i.test(submitText) || /\/edit(?:\?|$)/.test(location.hash);
    const confirmed = await confirmAction(isUpdate ? "Save these changes?" : "Save this record?", {
      title: isUpdate ? "Confirm update" : "Confirm save",
      confirmLabel: "Save",
      cancelLabel: "Cancel"
    });
    if (!confirmed) return;
    form.dataset.confirmedSubmit = "true";
    if (submitter && typeof form.requestSubmit === "function") form.requestSubmit(submitter);
    else form.requestSubmit();
  }, true);
}

function getQuery() {
  const hashQuery = location.hash?.startsWith("#/") && location.hash.includes("?") ? location.hash.slice(location.hash.indexOf("?") + 1) : "";
  return Object.fromEntries(new URLSearchParams(hashQuery || location.search).entries());
}

function getQueryParams() {
  const hashQuery = location.hash?.startsWith("#/") && location.hash.includes("?") ? location.hash.slice(location.hash.indexOf("?") + 1) : "";
  return new URLSearchParams(hashQuery || location.search);
}

function setQuery(basePath, values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  navigate(`${basePath}${params.toString() ? `?${params}` : ""}`);
}

function pagedRows(rows, basePath, pageSize = 100) {
  const query = getQueryParams();
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, Number(query.get("page") || 1)), totalPages);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, totalRows);
  const pageRows = rows.slice(start, end);
  const pageHref = (nextPage) => {
    const params = getQueryParams();
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const search = params.toString();
    return `${basePath}${search ? `?${search}` : ""}`;
  };
  const controls =
    totalRows <= pageSize
      ? ""
      : `<nav class="table-pagination" aria-label="Table pages">
          <a class="btn btn-secondary ${page <= 1 ? "is-disabled" : ""}" href="${pageHref(page - 1)}" data-link>Previous</a>
          <span>Page ${page} of ${totalPages}</span>
          <a class="btn btn-secondary ${page >= totalPages ? "is-disabled" : ""}" href="${pageHref(page + 1)}" data-link>Next</a>
        </nav>`;
  return { rows: pageRows, start: totalRows ? start + 1 : 0, end, totalRows, controls };
}

function beneficiaryOptionList(selected = "") {
  return repository
    .getSnapshot()
    .beneficiaries.filter((item) => !item.archived)
    .map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(getCooperatorView(item).firmName)} - ${escapeHtml(getCooperatorView(item).cooperatorName)}</option>`)
    .join("");
}

function yearOptions(selected = "") {
  const years = [
    ...new Set(
      repository
        .getSnapshot()
        .beneficiaries.filter((item) => !item.archived)
        .flatMap((item) => {
          const cooperator = getCooperatorView(item);
          return [item.project.projectYear, cooperator.setup.yearAwarded, ...cooperator.setup.phases.map((phase) => phase.yearAwarded)].filter(Boolean);
        })
    )
  ].sort((a, b) => b - a);
  return years.map((year) => `<option value="${year}" ${String(year) === String(selected) ? "selected" : ""}>${year}</option>`).join("");
}

function setupStatusOptions(selected = "", { includeArchived = false } = {}) {
  const options = [...new Set(["Pending", ...lookups.setupProjectStatuses, "Cancelled", "Returned", ...(includeArchived ? ["Archived"] : [])])];
  return options.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
}

function setupPhaseSummary(phases = []) {
  if (!phases.length) return `<span class="muted">No SETUP phase</span>`;
  const visible = phases.slice(0, 3);
  const extra = phases.length - visible.length;
  return `<div class="phase-summary">${visible
    .map((phase) => `<span class="phase-chip"><b>${escapeHtml(phase.phase)}</b>${statusBadge(phase.status || "Pending")}${phase.archived ? `<span class="archive-mini">Archived</span>` : ""}</span>`)
    .join("")}${extra > 0 ? `<span class="phase-more">+${extra} more</span>` : ""}</div>`;
}

function setupPhasePlainSummary(phases = []) {
  if (!phases.length) return "No SETUP phase";
  return escapeHtml(phases.map((phase) => `${phase.phase}: ${phase.status || "Pending"}${phase.archived ? " (archived)" : ""}`).join(", "));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-PH");
}

function maxFor(rows, key) {
  return Math.max(...rows.map((row) => Number(row[key] || 0)), 0);
}

function metricCell(value, max, formatter = formatNumber) {
  const amount = Number(value || 0);
  const width = max > 0 ? Math.min(100, Math.max(amount > 0 ? 5 : 0, (amount / max) * 100)) : 0;
  return `
    <div class="dashboard-metric">
      <strong>${escapeHtml(formatter(amount))}</strong>
      <span class="metric-track" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></span>
    </div>
  `;
}

function attentionMeta(meta) {
  if (typeof meta === "number") return formatCurrency(meta);
  const value = String(meta || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  return value;
}

function compactAttentionRows(attention) {
  const grouped = new Map();
  attention.forEach((item) => {
    const metaLabel = attentionMeta(item.meta);
    const key = `${item.type}|${item.text}|${metaLabel}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { ...item, metaLabel, count: 1 });
    }
  });
  return [...grouped.values()];
}

function getUpcomingRefundRows(asOf = todayIso(), limit = 6) {
  return beneficiaryService
    .list({ asOf })
    .flatMap((beneficiary) => {
      const cooperator = getCooperatorView(beneficiary, beneficiary.financials, asOf);
      const hasSetup = cooperator.services.some((service) => service.category === "SETUP");
      if (!hasSetup || beneficiary.archived) return [];
      return beneficiary.financials.schedule
        .filter((row) => row.remainingAmount > 0.01)
        .filter((row) => row.dueDate >= asOf || row.status === "Due")
        .map((row) => ({
          id: beneficiary.id,
          firmName: cooperator.firmName,
          cooperatorName: cooperator.cooperatorName,
          refundMonth: row.refundMonth,
          dueDate: row.dueDate,
          amount: row.remainingAmount,
          status: row.status,
          searchText: `${cooperator.firmName} ${cooperator.cooperatorName} ${row.refundMonth} ${row.status}`
        }));
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount)
    .slice(0, limit);
}

function referenceDueTable(rows) {
  return `
    <section class="reference-panel reference-due-panel">
      <div class="reference-panel-title reference-title-navy">Upcoming Monthly Refunds</div>
      ${
        rows.length
          ? `<div class="reference-table-wrap">
              <table class="reference-table">
                <thead>
                  <tr><th>Name of Firm</th><th>Cooperator</th><th>Refund Month</th><th>Due Date</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) =>
                        `<tr><td><a href="/beneficiaries/${row.id}" data-link>${escapeHtml(row.firmName)}</a></td><td>${escapeHtml(row.cooperatorName)}</td><td>${escapeHtml(row.refundMonth)}</td><td>${formatDate(row.dueDate)}</td><td>${formatCurrency(row.amount)}</td><td>${statusBadge(row.status)}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="dashboard-empty">No upcoming monthly refund obligations found.</div>`
      }
    </section>
  `;
}

function referenceSourceGraphCard({ title, description, columns, rows, empty = "No source data available." }) {
  return `
    <section class="reference-source-panel">
      <header class="reference-source-head">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </header>
      ${
        rows.length
          ? `<div class="reference-source-table-wrap">
              <table class="reference-source-table">
                <thead>
                  <tr>${columns.map((column) => `<th class="${column.align === "right" ? "is-right" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) =>
                        `<tr>${columns
                          .map((column) => `<td class="${column.align === "right" ? "is-right" : ""} ${column.isLabel ? "is-label" : ""}">${column.render(row)}</td>`)
                          .join("")}</tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="dashboard-empty">${escapeHtml(empty)}</div>`
      }
    </section>
  `;
}

function referenceSourceGraphs(summary) {
  const monthlyRows = [...summary.charts.monthlyCollection];
  const setupFundRows = [...(summary.charts.setupFundByYear || [])].sort((a, b) => Number(b.label) - Number(a.label));
  const monthlyMax = maxFor(monthlyRows, "value");
  const setupFundMax = maxFor(setupFundRows, "fund");
  const firmMax = maxFor(setupFundRows, "firms");

  return `
    <section class="reference-source-grid" aria-label="Workbook source data graphs">
      ${referenceSourceGraphCard({
        title: "Monthly Collection Trend",
        description: "Recent payment activity.",
        rows: monthlyRows,
        columns: [
          { label: "Month", isLabel: true, render: (row) => escapeHtml(row.label) },
          { label: "Collected", align: "right", render: (row) => metricCell(row.value, monthlyMax, formatCurrency) }
        ]
      })}
      ${referenceSourceGraphCard({
        title: "Setup Fund",
        description: "SETUP fund and number of firms grouped by project year.",
        rows: setupFundRows,
        columns: [
          { label: "Year", isLabel: true, render: (row) => escapeHtml(row.label) },
          { label: "Setup Fund", align: "right", render: (row) => metricCell(row.fund, setupFundMax, formatCurrency) },
          { label: "Firms", align: "right", render: (row) => metricCell(row.firms, firmMax, formatNumber) }
        ]
      })}
    </section>
  `;
}

function yearContext(year) {
  return year ? `Selected year: ${year}` : "All available project years";
}

function dashboardTabs(activeTab = "collection") {
  return `
    <nav class="dashboard-tabs" aria-label="Dashboard sections">
      <a class="${activeTab === "collection" ? "active" : ""}" href="${routeHref("/")}" data-link>Collection Dashboard</a>
      <a class="${activeTab === "analytics" ? "active" : ""}" href="${routeHref("/?tab=analytics")}" data-link>Demographics & Analytics</a>
    </nav>
  `;
}

function validSetupInvestmentPhases(phases = []) {
  return phases.filter((phase) => {
    if (phase.archived) return false;
    if (["Cancelled", "Terminated"].includes(phase.status)) return false;
    return true;
  });
}

function analyticsRows(filters = {}) {
  return beneficiaryService
    .list({ includeArchived: true })
    .map((beneficiary) => {
      const cooperator = getCooperatorView(beneficiary, beneficiary.financials);
      const setupPhases = validSetupInvestmentPhases(cooperator.setup?.phases || []);
      const rawDistrict = cooperator.district || getMunicipalityDistrict(cooperator.municipality) || "";
      const district = String(rawDistrict).toLowerCase().includes("1") || String(rawDistrict).toLowerCase().includes("first")
        ? "First District"
        : String(rawDistrict).toLowerCase().includes("2") || String(rawDistrict).toLowerCase().includes("second")
          ? "Second District"
          : "No District";
      const sex = normalizeSex(cooperator.sex);
      const pwd = cooperator.pwd === "Yes";
      const ip = cooperator.indigenousPeople === "Yes";
      const activeFirm = !beneficiary.archived && !["Archived", "Terminated", "Withdrawn"].includes(beneficiary.status);
      return {
        id: beneficiary.id,
        firmName: cooperator.firmName,
        cooperatorName: cooperator.cooperatorName,
        municipality: cooperator.municipality || "Not classified",
        district,
        hasSetup: Boolean(cooperator.hasSetup),
        setupProjectCount: setupPhases.length,
        setupInvestment: setupPhases.reduce((sum, phase) => sum + toNumber(phase.fundAssistance), 0),
        businessType: normalizeBusinessType(cooperator.businessType),
        businessSector: normalizeDisplayCategory(cooperator.businessSector, "Not classified"),
        classification: normalizeBusinessClassification(cooperator.enterpriseClassification),
        sex,
        age: Number(cooperator.age || 0),
        senior: Number(cooperator.age || 0) >= 60,
        pwd,
        ip,
        activeFirm,
        lat: Number(beneficiary.coordinates?.lat || beneficiary.location?.lat || beneficiary.latitude || 0),
        lng: Number(beneficiary.coordinates?.lng || beneficiary.location?.lng || beneficiary.longitude || 0)
      };
    })
    .filter((row) => {
      if (filters.district && row.district !== filters.district) return false;
      if (filters.businessSector && row.businessSector !== filters.businessSector) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (filters.pwd && (filters.pwd === "Yes") !== row.pwd) return false;
      if (filters.ip && (filters.ip === "Yes") !== row.ip) return false;
      return true;
    });
}

function normalizeDisplayCategory(value = "", fallback = "Not classified") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || /^(n\/a|na|none|null|undefined|not provided|not classified|not yet classified)$/i.test(text)) return fallback;
  return text
    .toLowerCase()
    .split(" ")
    .map((part) => (part.length <= 3 && part === part.toUpperCase() ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function normalizeSex(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (text === "m" || text === "male") return "Male";
  if (text === "f" || text === "female") return "Female";
  return "Unknown/Unspecified";
}

function normalizeBusinessType(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!text || /^(n\/a|na|none|null|undefined|not provided|not classified)$/i.test(text)) return "Not classified";
  if (text.includes("sole")) return "Sole Proprietorship";
  if (text.includes("coop")) return "Cooperative";
  if (text.includes("corp")) return "Corporation";
  if (text.includes("partner")) return "Partnership";
  return normalizeDisplayCategory(text);
}

function normalizeBusinessClassification(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (text.includes("micro")) return "Micro";
  if (text.includes("small")) return "Small";
  if (text.includes("medium")) return "Medium";
  return "Other/Not classified";
}

function analyticsPercent(value, total) {
  return total > 0 ? `${((Number(value || 0) / total) * 100).toFixed(1)}%` : "0.0%";
}

function countBy(rows, key) {
  return [...rows.reduce((map, row) => map.set(row[key], (map.get(row[key]) || 0) + 1), new Map()).entries()]
    .map(([label, value]) => ({ label, value, percent: analyticsPercent(value, rows.length) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function countByLabels(rows, labels, predicate) {
  return labels.map((label) => {
    const value = rows.filter((row) => predicate(row, label)).length;
    return { label, value, percent: analyticsPercent(value, rows.length) };
  });
}

function analyticsAgeRows(rows) {
  const buckets = [
    { label: "Below 18", test: (age) => age > 0 && age < 18 },
    { label: "18-30", test: (age) => age >= 18 && age <= 30 },
    { label: "31-45", test: (age) => age >= 31 && age <= 45 },
    { label: "46-59", test: (age) => age >= 46 && age <= 59 },
    { label: "60+", test: (age) => age >= 60 }
  ];
  return buckets.map((bucket) => {
    const value = rows.filter((row) => bucket.test(row.age)).length;
    return { label: bucket.label, value, percent: analyticsPercent(value, rows.length) };
  });
}

function analyticsDistrictRows(rows) {
  const districts = [...new Set(rows.map((row) => row.district))].sort();
  return districts.map((district) => {
    const districtRows = rows.filter((row) => row.district === district);
    return {
      label: district,
      cooperators: districtRows.length,
      firms: new Set(districtRows.map((row) => row.firmName)).size
    };
  });
}

function analyticsCard(label, value, context, iconName = "info", tone = "green") {
  return `<article class="analytics-card"><div class="analytics-ribbon analytics-ribbon-${tone}">${icon(iconName)}<span>${escapeHtml(label)}</span></div><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(context || "")}</small></article>`;
}

function analyticsSummaryDonutCard({ title, rows, total, iconName = "info", empty = "No data available." }) {
  const visibleRows = rows.filter((row) => Number(row.value || 0) > 0);
  let offset = 0;
  const circles = visibleRows
    .map((row, index) => {
      const share = Number(row.value || 0) / Math.max(1, total);
      const dash = `${share * 100} ${100 - share * 100}`;
      const circle = `<circle class="analytics-arc analytics-arc-${index % 5}" cx="22" cy="22" r="16" pathLength="100" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"></circle>`;
      offset += share * 100;
      return circle;
    })
    .join("");
  return `
    <article class="analytics-card analytics-summary-card analytics-summary-donut-card">
      ${icon(iconName)}
      <span>${escapeHtml(title)}</span>
      ${
        total && visibleRows.length
          ? `<div class="analytics-summary-donut">
              <svg viewBox="0 0 44 44" role="img" aria-label="${escapeHtml(rows.map((row) => `${row.label}: ${row.value} (${row.percent})`).join("; "))}">
                <title>${escapeHtml(rows.map((row) => `${row.label}: ${row.value} (${row.percent})`).join("; "))}</title>
                <circle class="analytics-track" cx="22" cy="22" r="16"></circle>
                ${circles}
                <circle class="analytics-hole" cx="22" cy="22" r="10"></circle>
              </svg>
              <strong>${escapeHtml(formatNumber(total))}</strong>
            </div>
            <div class="analytics-summary-list">
              ${rows.map((row, index) => `<p><i class="analytics-dot analytics-arc-dot-${index % 5}"></i><span>${escapeHtml(row.label)}</span><b>${escapeHtml(formatNumber(row.value))}</b><em>${escapeHtml(row.percent)}</em></p>`).join("")}
            </div>`
          : `<small>${escapeHtml(empty)}</small>`
      }
    </article>
  `;
}

function analyticsSummaryListCard({ title, rows, iconName = "info", limit = 4, empty = "No data available.", tone = "green" }) {
  const visibleRows = rows.slice(0, limit);
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return `
    <article class="analytics-card analytics-summary-card analytics-summary-list-card">
      <div class="analytics-ribbon analytics-ribbon-${tone}">${icon(iconName)}<span>${escapeHtml(title)}</span></div>
      <strong>${formatNumber(total)}</strong>
      ${
        visibleRows.length
          ? `<div class="analytics-summary-list">
              ${visibleRows.map((row, index) => `<p><i class="analytics-dot analytics-arc-dot-${index % 5}"></i><span>${escapeHtml(row.label)}</span><b>${escapeHtml(formatNumber(row.value))}</b><em>${escapeHtml(row.percent || "")}</em></p>`).join("")}
            </div>`
          : `<small>${escapeHtml(empty)}</small>`
      }
    </article>
  `;
}

function analyticsDoughnutCard({ title, rows, empty = "No demographic data available." }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  let offset = 0;
  const circles = total
    ? rows
        .map((row, index) => {
          const share = Number(row.value || 0) / total;
          const dash = `${share * 100} ${100 - share * 100}`;
          const circle = `<circle class="analytics-arc analytics-arc-${index % 5}" cx="22" cy="22" r="16" pathLength="100" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"></circle>`;
          offset += share * 100;
          return circle;
        })
        .join("")
    : "";
  return `
    <article class="analytics-panel analytics-chart-panel">
      <h3>${escapeHtml(title)}</h3>
      ${total ? `<div class="analytics-doughnut"><svg viewBox="0 0 44 44"><circle class="analytics-track" cx="22" cy="22" r="16"></circle>${circles}<circle class="analytics-hole" cx="22" cy="22" r="10"></circle></svg><strong>${total}</strong></div>` : `<div class="dashboard-empty">${escapeHtml(empty)}</div>`}
      <div class="analytics-legend">${rows.map((row) => `<span><b></b>${escapeHtml(row.label)} <strong>${formatNumber(row.value)}</strong> <em>${escapeHtml(row.percent)}</em></span>`).join("")}</div>
    </article>
  `;
}

function renderAnalyticsPieCard({ title, rows, cutout = 0, empty = "No data available for the selected filters." }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const hasData = total > 0;
  const chartId = `pie-${slug(title)}-${Math.random().toString(36).slice(2, 8)}`;
  const labels = rows.map((row) => row.label);
  const values = rows.map((row) => Number(row.value || 0));
  return `
    <article class="analytics-panel analytics-chart-panel analytics-pie-panel">
      <h3>${escapeHtml(title)}</h3>
      ${hasData
        ? `<div class="analytics-pie-wrap" data-chartjs="pie" data-chart-id="${escapeHtml(chartId)}" data-labels='${escapeHtml(JSON.stringify(labels))}' data-values='${escapeHtml(JSON.stringify(values))}' data-cutout="${cutout}"></div>`
        : `<div class="dashboard-empty">${escapeHtml(empty)}</div>`
      }
    </article>
  `;
}

function analyticsBarCard({ title, rows, mode = "vertical", valueKey = "value", secondaryKey = "" }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(Number(row[valueKey] || 0), Number(secondaryKey ? row[secondaryKey] || 0 : 0))));
  const body = rows.length
    ? rows
        .map((row) => {
          const primary = Number(row[valueKey] || 0);
          const secondary = Number(secondaryKey ? row[secondaryKey] || 0 : 0);
          return `
            <div class="analytics-bar-row ${mode === "vertical" ? "is-vertical" : ""}">
              <span>${escapeHtml(row.label)}</span>
              <div class="analytics-bar-track">
                <i style="--bar:${(primary / max) * 100}%"></i>
                ${secondaryKey ? `<i class="secondary" style="--bar:${(secondary / max) * 100}%"></i>` : ""}
              </div>
              <strong>${formatNumber(primary)}${secondaryKey ? ` / ${formatNumber(secondary)}` : ""}</strong>
              ${row.percent ? `<em>${escapeHtml(row.percent)}</em>` : ""}
            </div>
          `;
        })
        .join("")
    : `<div class="dashboard-empty">No chart data available.</div>`;
  return `<article class="analytics-panel analytics-bar-panel"><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function getMunicipalityIntensity(count, allCounts) {
  if (!count) return "none";
  const positiveCounts = [...new Set(allCounts.map((value) => Number(value || 0)).filter((value) => value > 0))].sort((a, b) => a - b);
  if (positiveCounts.length <= 1) return "low";
  const lowThreshold = positiveCounts[Math.floor((positiveCounts.length - 1) / 3)];
  const highThreshold = positiveCounts[Math.ceil(((positiveCounts.length - 1) * 2) / 3)];
  if (count >= highThreshold) return "high";
  if (count > lowThreshold) return "medium";
  return "low";
}

function normalizeDistrictLabel(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (/\b(1|1st|first)\b/.test(text)) return "First District";
  if (/\b(2|2nd|second)\b/.test(text)) return "Second District";
  return "No District";
}

function uniqueSetupRows(rows) {
  return [...rows
    .reduce((map, row) => {
      const key = row.id || `${row.firmName || "firm"}-${row.cooperatorName || "cooperator"}-${row.municipality || "municipality"}`;
      if (!map.has(key)) map.set(key, row);
      return map;
    }, new Map())
    .values()];
}

function groupFirmsByMunicipality(rows) {
  const groups = new Map(
    municipalityMapPoints.map((item) => [
      item.name,
      {
        label: item.name,
        district: item.district,
        value: 0,
        rows: [],
        coordinates: item.coordinates
      }
    ])
  );
  rows.forEach((row) => {
    const municipality = normalizeMunicipality(row.municipality);
    if (!groups.has(municipality)) {
      groups.set(municipality, {
        label: municipality,
        district: municipality === noMunicipalityLabel ? "No District" : getMunicipalityDistrictName(municipality),
        value: 0,
        rows: [],
        coordinates: getMunicipalityCoordinates(municipality)
      });
    }
    const group = groups.get(municipality);
    // Analytics rows are one row per cooperator/firm, so this maps firm concentration without double-counting setup phases.
    group.value += 1;
    group.rows.push(row);
  });
  return [...groups.values()].sort((a, b) => {
    if (a.label === noMunicipalityLabel) return 1;
    if (b.label === noMunicipalityLabel) return -1;
    return b.value - a.value || a.label.localeCompare(b.label);
  });
}

function buildProjectMunicipalitySummary(rows, filters = {}) {
  // Count unique cooperator/firms with at least one SETUP project; additional SETUP phases must not inflate municipality coverage.
  const uniqueRows = uniqueSetupRows(rows);
  const rowGroups = uniqueRows.reduce((map, row) => {
    const municipality = normalizeMunicipality(row.municipality);
    if (!map.has(municipality)) map.set(municipality, []);
    map.get(municipality).push(row);
    return map;
  }, new Map());
  const districtOrder = ["First District", "Second District", "No District"];
  const districtGroups = new Map(districtOrder.map((district) => [district, []]));

  municipalityMapPoints.forEach((item) => {
    const district = normalizeDistrictLabel(item.district);
    if (!districtGroups.has(district)) districtGroups.set(district, []);
    const municipalityRows = rowGroups.get(item.name) || [];
    districtGroups.get(district).push({
      municipality: item.name,
      district,
      rows: municipalityRows,
      count: municipalityRows.length,
      projectCount: municipalityRows.reduce((sum, row) => sum + Number(row.setupProjectCount || 0), 0),
      investment: municipalityRows.reduce((sum, row) => sum + toNumber(row.setupInvestment), 0),
      selected: filters.mapFocus === item.name
    });
  });

  const unclassifiedRows = rowGroups.get(noMunicipalityLabel) || [];
  if (unclassifiedRows.length) {
    districtGroups.get("No District").push({
      municipality: noMunicipalityLabel,
      district: "No District",
      rows: unclassifiedRows,
      count: unclassifiedRows.length,
      projectCount: unclassifiedRows.reduce((sum, row) => sum + Number(row.setupProjectCount || 0), 0),
      investment: unclassifiedRows.reduce((sum, row) => sum + toNumber(row.setupInvestment), 0),
      selected: filters.mapFocus === noMunicipalityLabel
    });
  }

  return [...districtGroups.entries()]
    .map(([district, municipalities]) => {
      const sortedMunicipalities = municipalities.sort((a, b) => b.count - a.count || a.municipality.localeCompare(b.municipality));
      const sectorCounts = uniqueSetupRows(sortedMunicipalities.flatMap((item) => item.rows)).reduce((map, row) => {
        const sector = normalizeDisplayCategory(row.businessSector, "Not classified");
        map.set(sector, (map.get(sector) || 0) + 1);
        return map;
      }, new Map());
      const sectors = [...sectorCounts.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
      const firmCount = sortedMunicipalities.reduce((sum, item) => sum + item.count, 0);
      const projectCount = sortedMunicipalities.reduce((sum, item) => sum + Number(item.projectCount || 0), 0);
      const investment = sortedMunicipalities.reduce((sum, item) => sum + toNumber(item.investment), 0);
      return {
        district,
        municipalities: sortedMunicipalities,
        totalMunicipalities: sortedMunicipalities.length,
        coveredMunicipalities: sortedMunicipalities.filter((item) => item.count > 0).length,
        zeroMunicipalities: sortedMunicipalities.filter((item) => item.count === 0).length,
        firmCount,
        projectCount,
        investment,
        topSector: firmCount ? sectors[0]?.label || "Not classified" : "No business sector data",
        sectors
      };
    })
    .filter((group) => group.totalMunicipalities > 0);
}

function sectorBreakdown(rows, limit = 4) {
  const counts = uniqueSetupRows(rows).reduce((map, row) => {
    const sector = normalizeDisplayCategory(row.businessSector, "Not classified");
    map.set(sector, (map.get(sector) || 0) + 1);
    return map;
  }, new Map());
  const sectors = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return sectors.length ? sectors.slice(0, limit) : [{ label: "No business sector data", value: 0 }];
}

function projectMunicipalityLink(municipality, filters = {}) {
  return routeHref(
    `/setup/project-map?${new URLSearchParams({
      district: filters.district || "",
      businessSector: filters.businessSector || "",
      mapFocus: municipality
    }).toString()}`
  );
}

function projectMunicipalitySummary(rows, filters = {}) {
  const groups = buildProjectMunicipalitySummary(rows, filters);
  const totalFirms = uniqueSetupRows(rows).length;
  const totalProjects = uniqueSetupRows(rows).reduce((sum, row) => sum + Number(row.setupProjectCount || 0), 0);
  const totalInvestment = uniqueSetupRows(rows).reduce((sum, row) => sum + toNumber(row.setupInvestment), 0);
  return `
    <article class="analytics-panel project-municipality-panel">
      <div class="analytics-panel-head">
        <div>
          <h3>SETUP Projects by Municipality and Business Sector</h3>
          <p>Unique firms/cooperators with at least one SETUP project. Investment includes every valid SETUP phase under the current filters.</p>
        </div>
        <div class="project-summary-badges">
          <strong>${formatNumber(totalFirms)} firm${totalFirms === 1 ? "" : "s"}</strong>
          <strong>${formatNumber(totalProjects)} SETUP project${totalProjects === 1 ? "" : "s"}</strong>
          <strong>${formatCurrency(totalInvestment)}</strong>
        </div>
      </div>
      ${totalFirms ? "" : `<div class="dashboard-empty">No SETUP Project records found for the current filters.</div>`}
      <div class="project-municipality-grid">
        ${groups
          .map(
            (group) => `
              <section class="project-district-card">
                <header>
                  <h4>${escapeHtml(group.district)}</h4>
                  <p>${formatNumber(group.coveredMunicipalities)} / ${formatNumber(group.totalMunicipalities)} municipalities covered</p>
                  <div class="project-district-metrics">
                    <span><b>${formatNumber(group.firmCount)}</b> firms with SETUP</span>
                    <span><b>${formatNumber(group.projectCount)}</b> SETUP projects</span>
                    <span>Total SETUP Fund Investment: <b>${formatCurrency(group.investment)}</b></span>
                    <span><b>${formatNumber(group.zeroMunicipalities)}</b> no SETUP Project</span>
                    <span>Top sector: <b>${escapeHtml(group.topSector)}</b></span>
                  </div>
                </header>
                <div class="project-municipality-list">
                  ${group.municipalities
                    .map((item) => {
                      const sectors = sectorBreakdown(item.rows);
                      const zeroClass = item.count === 0 ? " is-zero" : "";
                      return `
                        <a href="${projectMunicipalityLink(item.municipality, filters)}" data-link class="project-municipality-row${zeroClass}${item.selected ? " is-selected" : ""}">
                          <span class="project-municipality-name">${escapeHtml(item.municipality)}</span>
                          <strong>${formatNumber(item.count)}</strong>
                          <small>${item.count === 0 ? "No SETUP Project" : "Firms with SETUP"}</small>
                          <span class="project-investment-line">Total SETUP Fund Investment: <b>${formatCurrency(item.investment)}</b></span>
                          <span class="project-count-line">${formatNumber(item.projectCount || 0)} SETUP project${Number(item.projectCount || 0) === 1 ? "" : "s"}</span>
                          <span class="project-sector-breakdown">
                            ${
                              item.count === 0
                                ? `<em>No business sector data</em>`
                                : sectors.map((sector) => `<em>${escapeHtml(sector.label)}: ${formatNumber(sector.value)}</em>`).join("")
                            }
                          </span>
                        </a>
                      `;
                    })
                    .join("")}
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function analyticsMap(rows, filters) {
  const baseQuery = {
    district: filters.district || "",
    businessSector: filters.businessSector || "",
    sex: filters.sex || "",
    pwd: filters.pwd || "",
    ip: filters.ip || ""
  };
  const mapRoute = filters.mapRoute || "/setup/project-map";
  const distribution = groupFirmsByMunicipality(rows);
  const total = rows.length;
  const mappedCounts = distribution.filter((group) => group.coordinates).map((group) => group.value);
  const selectedMunicipality = distribution.some((group) => group.label === filters.mapFocus) ? filters.mapFocus : "";
  const linkFor = (municipality) => routeHref(`${mapRoute}?${new URLSearchParams({ ...baseQuery, mapFocus: municipality }).toString()}`);
  const mapGroups = distribution
    .filter((group) => group.coordinates)
    .map((group) => {
      const intensity = getMunicipalityIntensity(group.value, mappedCounts);
      return {
        label: group.label,
        district: group.district,
        value: group.value,
        percent: analyticsPercent(group.value, total),
        intensity,
        coordinates: group.coordinates,
        selected: selectedMunicipality === group.label,
        link: linkFor(group.label)
      };
    });
  const mapPayload = encodeURIComponent(JSON.stringify({ groups: mapGroups, bounds: ilocosSurBounds, fitPoints: municipalityMapBounds, selected: selectedMunicipality }));
  const municipalityChips = distribution
    .filter((group) => group.value > 0 || group.label === noMunicipalityLabel || selectedMunicipality === group.label)
    .map((group) => {
      const activeClass = selectedMunicipality === group.label ? " is-selected" : "";
      const level = group.label === noMunicipalityLabel ? "none" : getMunicipalityIntensity(group.value, mappedCounts);
      return `<a href="${linkFor(group.label)}" data-link class="analytics-district-chip heat-${level}${activeClass}"><span>${escapeHtml(group.label)}</span><strong>${formatNumber(group.value)}</strong><em>${escapeHtml(analyticsPercent(group.value, total))}</em></a>`;
    })
    .join("");
  const selectedGroup = selectedMunicipality ? distribution.find((group) => group.label === selectedMunicipality) : null;
  const firmRows = selectedGroup?.rows || [];
  const firmList = selectedMunicipality
    ? firmRows.length
      ? `<div class="analytics-firm-list">${firmRows
          .slice(0, 40)
          .map((row) => `<p><b>${escapeHtml(row.firmName || "Unnamed firm")}</b><span>${escapeHtml(row.cooperatorName || "No cooperator")} · ${escapeHtml(row.municipality)} · ${escapeHtml(row.businessType)} · ${escapeHtml(row.classification)}</span></p>`)
          .join("")}</div>`
      : `<div class="dashboard-empty">No firms match ${escapeHtml(selectedMunicipality)} under the current filters.</div>`
    : `<div class="dashboard-empty">Select a municipality to view firms.</div>`;
  return `
    <article class="analytics-panel analytics-map-panel">
      <div class="analytics-panel-head">
        <div><h3>SETUP Cooperators Distribution Map</h3><p>Pan and zoom within Ilocos Sur. Heatmap shows firm concentration by municipality.</p></div>
      </div>
      <div class="analytics-map-canvas" data-leaflet-map data-map-payload="${escapeHtml(mapPayload)}">
        <div class="dashboard-empty analytics-map-loading">Loading municipality map...</div>
        <div class="analytics-map-legend"><strong>SETUP Project Coverage</strong><span><i class="heat-none"></i>No SETUP Project</span><span><i class="heat-low"></i>Low</span><span><i class="heat-medium"></i>Medium</span><span><i class="heat-high"></i>High</span></div>
      </div>
      <div class="analytics-district-summary analytics-municipality-summary">${municipalityChips || `<div class="dashboard-empty">No municipality data available.</div>`}</div>
      <div class="analytics-map-popup">
        <strong>Firms in Selected Municipality${selectedMunicipality ? `: ${escapeHtml(selectedMunicipality)}` : ""}</strong>
        <small>${selectedMunicipality ? `${formatNumber(firmRows.length)} of ${formatNumber(total)} filtered cooperators` : "Current filters are respected."}</small>
        ${firmList}
      </div>
    </article>
  `;
}

function getAnalyticsDashboard(filters = {}) {
  const rows = analyticsRows(filters);
  const sexRows = countByLabels(rows, ["Female", "Male"], (row, label) => row.sex === label);
  const seniorRows = [
    { label: "Senior", value: rows.filter((row) => row.senior).length },
    { label: "Non-Senior", value: rows.filter((row) => !row.senior).length }
  ].map((row) => ({ ...row, percent: analyticsPercent(row.value, rows.length) }));
  const pwdRows = [
    { label: "PWD", value: rows.filter((row) => row.pwd).length },
    { label: "Non-PWD", value: rows.filter((row) => !row.pwd).length }
  ].map((row) => ({ ...row, percent: analyticsPercent(row.value, rows.length) }));
  const ipRows = [
    { label: "Indigenous People", value: rows.filter((row) => row.ip).length },
    { label: "Non-Indigenous People", value: rows.filter((row) => !row.ip).length }
  ].map((row) => ({ ...row, percent: analyticsPercent(row.value, rows.length) }));
  const priorityRows = [
    { label: "Senior Citizens", value: seniorRows[0].value },
    { label: "PWD", value: pwdRows[0].value },
    { label: "Indigenous People", value: ipRows[0].value }
  ].map((row) => ({ ...row, percent: analyticsPercent(row.value, rows.length) }));
  const businessTypeRows = countBy(rows, "businessType");
  const businessSectorRows = countBy(rows, "businessSector");
  const classificationRows = countByLabels(rows, ["Micro", "Small", "Medium", "Other/Not classified"], (row, label) => row.classification === label);
  const districtSummaryRows = countByLabels(rows, ["First District", "Second District"], (row, label) => row.district === label);
  const topBusinessTypeRows = businessTypeRows.filter((row) => row.label !== "Not classified");
  const topBusinessTypes = (topBusinessTypeRows.length ? topBusinessTypeRows : businessTypeRows).slice(0, 3);
  return {
    rows,
    sexRows,
    ageRows: analyticsAgeRows(rows),
    seniorRows,
    pwdRows,
    ipRows,
    priorityRows,
    businessTypeRows,
    businessSectorRows,
    classificationRows,
    districtSummaryRows,
    topBusinessTypes,
    districtRows: analyticsDistrictRows(rows),
    summary: {
      total: rows.length,
      male: sexRows.find((r) => r.label === "Male")?.value || 0,
      female: sexRows.find((r) => r.label === "Female")?.value || 0,
      seniors: seniorRows[0].value,
      pwd: pwdRows[0].value,
      ip: ipRows[0].value,
      activeFirms: rows.filter((row) => row.activeFirm).length,
      districts: new Set(rows.map((row) => row.district)).size,
      topBusinessType: topBusinessTypes[0]?.label || "No data",
      topClassification: classificationRows.find((row) => row.value > 0)?.label || "No data"
    }
  };
}

function renderAnalyticsDashboard() {
  const query = getQuery();
  const filters = {
    tab: "analytics",
    district: query.district || "",
    businessSector: query.businessSector || "",
    sex: query.sex || "",
    pwd: query.pwd || "",
    ip: query.ip || "",
    mapFocus: query.mapFocus || ""
  };
  const analytics = getAnalyticsDashboard(filters);
  const summaryCards = [
    analyticsCard("Total Cooperators", analytics.summary.total, "Unique Firms from Approved SETUP Projects", "users", "green"),
    analyticsSummaryListCard({ title: "Sex Disaggregated Data", rows: analytics.sexRows, iconName: "users", limit: 2, empty: "No sex data available.", tone: "navy" }),
    analyticsSummaryListCard({ title: "Vulnerable Individuals", rows: analytics.priorityRows, iconName: "check", limit: 3, empty: "No priority group data available.", tone: "green" }),
    analyticsSummaryListCard({ title: "District Distribution", rows: analytics.districtSummaryRows, iconName: "dashboard", limit: 2, empty: "No district data available.", tone: "navy" }),
    analyticsSummaryListCard({ title: "Type of Business", rows: analytics.topBusinessTypes, iconName: "folder", limit: 3, empty: "No business type data available.", tone: "green" }),
    analyticsSummaryListCard({ title: "Enterprise Classification", rows: analytics.classificationRows, iconName: "report", limit: 4, empty: "No classification data available.", tone: "navy" })
  ];
  const districts = [...new Set(analyticsRows({}).map((row) => row.district))].sort();
  const sectors = [...new Set(analyticsRows({}).map((row) => row.businessSector))].sort();
  const sectorRows = analytics.businessSectorRows;
  const topSectors = sectorRows.slice(0, 5);
  const othersCount = sectorRows.slice(5).reduce((sum, row) => sum + Number(row.value || 0), 0);
  const pieSectorRows = othersCount > 0 ? [...topSectors, { label: "Others", value: othersCount, percent: analyticsPercent(othersCount, analytics.rows.length) }] : topSectors;
  const districtPieRows = analytics.districtRows.map((row) => ({ label: row.label, value: row.cooperators, percent: analyticsPercent(row.cooperators, analytics.rows.length) }));
  return `
    <section class="analytics-dashboard" aria-label="Demographics and analytics dashboard">
      <div class="analytics-toolbar">
        <label>District <select data-analytics-filter="district"><option value="">All districts</option>${districts.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Business Sector <select data-analytics-filter="businessSector"><option value="">All sectors</option>${sectors.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Sex <select data-analytics-filter="sex"><option value="">All</option>${["Male", "Female", "Not specified"].map((item) => `<option value="${escapeHtml(item)}" ${item === filters.sex ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>PWD Status <select data-analytics-filter="pwd"><option value="">All</option>${["Yes", "No"].map((item) => `<option value="${item}" ${item === filters.pwd ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label>IP Status <select data-analytics-filter="ip"><option value="">All</option>${["Yes", "No"].map((item) => `<option value="${item}" ${item === filters.ip ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <button class="btn btn-ghost" type="button" data-action="reset-analytics">Reset</button>
        <button class="btn btn-secondary" type="button" data-action="export-analytics-pdf">${icon("download")}<span>Export PDF</span></button>
        <button class="btn btn-secondary" type="button" data-action="export-analytics-excel">${icon("download")}<span>Export Excel</span></button>
        <button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")}<span>Print Dashboard</span></button>
        ${buttonLink("/setup/project-map", "View Project Map", "dashboard", "secondary")}
      </div>
      <section class="analytics-summary-grid analytics-summary-grid-balanced">${summaryCards.join("")}</section>
      <section class="analytics-chart-grid">
        ${renderAnalyticsPieCard({ title: "Sex Disaggregated Data", rows: analytics.sexRows })}
        ${renderAnalyticsPieCard({ title: "Age Distribution", rows: analytics.ageRows })}
        ${renderAnalyticsPieCard({ title: "Senior Citizen Distribution", rows: analytics.seniorRows })}
        ${renderAnalyticsPieCard({ title: "PWD Distribution", rows: analytics.pwdRows })}
        ${renderAnalyticsPieCard({ title: "Indigenous People Distribution", rows: analytics.ipRows })}
        ${renderAnalyticsPieCard({ title: "Type of Business", rows: analytics.businessTypeRows })}
        ${renderAnalyticsPieCard({ title: "Business Sector Distribution", rows: pieSectorRows })}
        ${renderAnalyticsPieCard({ title: "Enterprise Classification", rows: analytics.classificationRows })}
        ${renderAnalyticsPieCard({ title: "Firm/District Distribution", rows: districtPieRows })}
      </section>
    </section>
  `;
}

function renderProjectMap() {
  const query = getQuery();
  const filters = {
    district: query.district || "",
    businessSector: query.businessSector || "",
    mapFocus: query.mapFocus || "",
    mapRoute: "/setup/project-map"
  };
  const rows = analyticsRows(filters).filter((row) => row.hasSetup && row.activeFirm && row.setupProjectCount > 0);
  const allRows = analyticsRows({}).filter((row) => row.hasSetup && row.activeFirm && row.setupProjectCount > 0);
  const districts = [...new Set(allRows.map((row) => row.district))].sort();
  const sectors = [...new Set(allRows.map((row) => row.businessSector))].sort();
  return `
    ${pageHeader({
      title: "SETUP Cooperators Project Map",
      eyebrow: "Dashboard / SETUP / Cooperators / Project Map",
      description: "Pan and zoom within Ilocos Sur. Heatmap shows firm concentration by municipality.",
      actions: `${buttonLink("/beneficiaries", "Cooperators", "users", "secondary")}${buttonLink("/", "Dashboard", "dashboard", "secondary")}`
    })}
    <section class="analytics-dashboard project-map-page" aria-label="SETUP cooperators project map">
      <div class="analytics-toolbar">
        <label>District <select data-project-map-filter="district"><option value="">All districts</option>${districts.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Business Sector <select data-project-map-filter="businessSector"><option value="">All sectors</option>${sectors.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <button class="btn btn-ghost" type="button" data-action="reset-project-map">Reset</button>
        <button class="btn btn-secondary" type="button" data-action="refresh-project-map">${icon("refresh")}<span>Refresh</span></button>
      </div>
      ${analyticsMap(rows, filters)}
      ${projectMunicipalitySummary(rows, filters)}
    </section>
  `;
}

function renderDashboard() {
  const filters = getQuery();
  const activeTab = filters.tab === "analytics" ? "analytics" : "collection";
  const asOf = filters.asOf || todayIso();
  const year = filters.year || "";
  const overview = dashboardService.getSystemOverview({ ...filters, asOf });
  const setupSummary = dashboardService.getSetupRefundDashboard({ reportingYear: year, asOf });
  const collectionChartRows = setupSummary.calendarMonthlyPerformance || setupSummary.monthlyPerformance;
  const sourceSummary = dashboardService.getSummary({ asOf });
  const overdueTotal = setupSummary.delinquentPayors.reduce((sum, item) => sum + Number(item.totalOverdueArrears || 0), 0);
  const collectionRate = setupSummary.monthlyTarget > 0 ? percent(setupSummary.monthlyCollection, setupSummary.monthlyTarget) : 0;
  const dueRows = getUpcomingRefundRows(asOf);
  const snapshot = repository.getSnapshot();
  const scheduleYears = beneficiaryService
    .list({ includeArchived: true, asOf })
    .flatMap((item) => (item.financials?.schedule || []).map((row) => String(row.dueDate || "").slice(0, 4)).filter(Boolean));
  const paymentYears = snapshot.payments.map((item) => String(item.paymentDate || item.dateReceived || "").slice(0, 4)).filter(Boolean);
  const projectYears = snapshot.beneficiaries.map((item) => String(item.project?.projectYear || "")).filter(Boolean);
  const yearChoices = Array.from(new Set([year, todayIso().slice(0, 4), ...scheduleYears, ...paymentYears, ...projectYears].filter(Boolean))).sort((a, b) => Number(b) - Number(a));
  const dashboardContext = `${year ? `Showing target collection for ${year}` : "Showing complete target collection range"} as of ${formatDate(asOf)}.`;
  const kpis = [
    {
      label: "Total SETUP Cooperators",
      value: String(setupSummary.totalSetupCooperators || setupSummary.totalSetupCustomers),
      context: "Unique Firms from Approved SETUP Projects",
      tone: "green",
      iconName: "users",
      route: "/beneficiaries"
    },
    {
      label: "Active SETUP Refund",
      value: String(setupSummary.activeSetupRefundCount),
      context: `Monthly Target Collection: ${formatCurrency(setupSummary.monthlyTarget)}`,
      tone: "navy",
      iconName: "cash",
      route: "/setup-refund?projectStatus=Ongoing"
    },
    {
      label: "Monthly Collection",
      value: formatCurrency(setupSummary.monthlyCollection),
      context: `${collectionRate.toFixed(1)}% of monthly target as of ${formatDate(asOf)}`,
      tone: "green",
      iconName: "check",
      route: "/collections"
    },
    {
      label: "Overdue Arrears",
      value: formatCurrency(overdueTotal),
      context: `${setupSummary.delinquentPayors.length} delinquent account(s)`,
      tone: "navy",
      iconName: "alert",
      route: "/setup-refund"
    }
  ];
  return `
    <section class="reference-dashboard" aria-label="DOST IS SETUP dashboard">
      <div class="reference-dashboard-decor" aria-hidden="true"></div>
      <header class="reference-dashboard-head">
        <div>
          <h1>DOST IS SETUP PROJECTS</h1>
          <p>Refund collection dashboard based on the Ilocos Sur SETUP repayment workbook and current system records. ${escapeHtml(dashboardContext)}</p>
        </div>
        <div class="reference-dashboard-actions">
          ${
            activeTab === "collection"
              ? `<label>Year <select data-dashboard-filter="year"><option value="" ${year ? "" : "selected"}>All years</option>${yearChoices.map((item) => `<option value="${escapeHtml(item)}" ${String(item) === String(year) ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
                 <label>As of <input type="date" data-dashboard-filter="asOf" value="${escapeHtml(asOf)}" /></label>`
              : ""
          }
          <button class="btn btn-secondary" type="button" data-action="refresh-dashboard">${icon("refresh")}<span>Refresh</span></button>
        </div>
      </header>
      ${dashboardTabs(activeTab)}
      ${
        activeTab === "analytics"
          ? renderAnalyticsDashboard()
          : `
            <section class="reference-kpi-grid">${kpis.map((item) => referenceKpiCard(item)).join("")}</section>
            <section class="reference-main-grid">
              ${referenceComparisonChart({
                title: "Target vs Collection",
                description: year ? `Target collection for selected year: ${year}.` : "Target collection across the full repayment period.",
                rows: collectionChartRows,
                axisX: "Month",
                rotateLabels: false,
                minPointWidth: 82,
                fitToContainer: true,
                hideAxisTitle: !year,
                year
              })}
              ${referenceLineChart({
                title: "Refund Collection Trend",
                description: year ? `Collection rate for selected year: ${year}.` : "Collection rate across the full repayment period.",
                rows: collectionChartRows,
                valueKey: "rate",
                format: "percent",
                legend: "Collection Rate",
                axisY: "Collection Rate",
                axisX: "Month",
                rotateLabels: false,
                minPointWidth: 82,
                fitToContainer: true,
                year
              })}
            </section>
            <section class="reference-lower-grid">
              ${referenceDueTable(dueRows)}
              ${referenceDonutCard({
                title: "Services Availed",
                data: overview.charts.byServiceCategory,
                footer: overview.charts.byServiceCategory[0] ? `Highest: ${overview.charts.byServiceCategory[0].label}` : ""
              })}
              ${referenceDonutCard({
                title: "SETUP Status Overview",
                data: overview.charts.bySetupStatus,
                showValues: true
              })}
            </section>
            ${referenceSourceGraphs({ charts: { ...sourceSummary.charts, setupFundByYear: setupSummary.charts.setupFundByYear } })}
            <footer class="reference-dashboard-foot">
              <span>Last updated ${new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span>
              <button class="btn btn-ghost" type="button" data-action="reset-dashboard">Reset filters</button>
              ${buttonLink("/setup-refund", "Open Detailed SETUP Dashboard", "dashboard", "secondary")}
            </footer>
          `
      }
    </section>
  `;
}

function bindDashboard() {
  document.querySelectorAll("[data-dashboard-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-dashboard-filter]").forEach((item) => {
        filters[item.dataset.dashboardFilter] = item.value;
      });
      setQuery("/", filters);
    });
  });
  document.querySelector("[data-action='reset-dashboard']")?.addEventListener("click", () => navigate("/"));
  document.querySelector("[data-action='refresh-dashboard']")?.addEventListener("click", async () => {
    try {
      await repository.reload();
      createToast("Dashboard refreshed from Supabase.");
      renderApp();
    } catch (error) {
      console.error(error);
      createToast("Could not refresh Supabase data.", "danger");
    }
  });
  document.querySelectorAll("[data-analytics-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = { tab: "analytics" };
      document.querySelectorAll("[data-analytics-filter]").forEach((item) => {
        filters[item.dataset.analyticsFilter] = item.value;
      });
      setQuery("/", filters);
    });
  });
  document.querySelector("[data-action='reset-analytics']")?.addEventListener("click", () => navigate("/?tab=analytics"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
  document.querySelector("[data-action='export-analytics-excel']")?.addEventListener("click", () => {
    const analytics = getAnalyticsDashboard({ ...getQuery(), tab: "analytics" });
    downloadXlsx(
      `dost-demographics-analytics-${todayIso()}.xlsx`,
      "Analytics",
      analytics.rows.map((row) => ({
        "Firm Name": row.firmName,
        "Cooperator Name": row.cooperatorName,
        Sex: row.sex,
        Age: row.age || "",
        "Senior Citizen": row.senior ? "Yes" : "No",
        PWD: row.pwd ? "Yes" : "No",
        IP: row.ip ? "Yes" : "No",
        "Business Type": row.businessType,
        "Business Sector": row.businessSector,
        Municipality: row.municipality,
        District: row.district,
        "Active Firm": row.activeFirm ? "Yes" : "No"
      }))
    );
    createToast("Demographics analytics exported to Excel.");
  });
  document.querySelector("[data-action='export-analytics-pdf']")?.addEventListener("click", () => {
    const analytics = getAnalyticsDashboard({ ...getQuery(), tab: "analytics" });
    downloadPdf(
      `dost-demographics-analytics-${todayIso()}.pdf`,
      "DOST IS SETUP Demographics & Analytics",
      analytics.rows.map((row) => ({
        Firm: row.firmName,
        Cooperator: row.cooperatorName,
        Sex: row.sex,
        Age: row.age || "",
        District: row.district,
        Sector: row.businessSector
      }))
    );
    createToast("Demographics analytics PDF exported.");
  });
}

function bindProjectMap() {
  document.querySelectorAll("[data-project-map-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-project-map-filter]").forEach((item) => {
        filters[item.dataset.projectMapFilter] = item.value;
      });
      setQuery("/setup/project-map", filters);
    });
  });
  document.querySelector("[data-action='reset-project-map']")?.addEventListener("click", () => navigate("/setup/project-map"));
  document.querySelector("[data-action='refresh-project-map']")?.addEventListener("click", async () => {
    try {
      await repository.reload();
      createToast("Project map refreshed from Supabase.");
      renderApp();
    } catch (error) {
      console.error(error);
      createToast("Could not refresh project map data.", "danger");
    }
  });
  bindAnalyticsMunicipalityMap();
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${leafletAssets.css}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = leafletAssets.css;
      document.head.append(link);
    }
    const existing = document.querySelector(`script[src="${leafletAssets.js}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = leafletAssets.js;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.append(script);
  });
  return leafletLoadPromise;
}

function bindAnalyticsMunicipalityMap() {
  const container = document.querySelector("[data-leaflet-map]");
  if (!container) return;
  let payload = { groups: [], bounds: ilocosSurBounds, selected: "" };
  try {
    payload = JSON.parse(decodeURIComponent(container.dataset.mapPayload || ""));
  } catch (error) {
    console.warn("Unable to parse municipality map payload.", error);
  }
  loadLeaflet()
    .then((L) => {
      container.innerHTML = `<div class="analytics-leaflet-map" data-leaflet-canvas></div>${container.querySelector(".analytics-map-legend")?.outerHTML || ""}`;
      const mapNode = container.querySelector("[data-leaflet-canvas]");
      const bounds = L.latLngBounds(payload.bounds || payload.fitPoints || ilocosSurBounds);
      const maxBounds = bounds.pad(0.16);
      const map = L.map(mapNode, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: false,
        maxBounds,
        maxBoundsViscosity: 1,
        minZoom: 9,
        maxZoom: 15
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 10 });
      map.setMaxBounds(maxBounds);
      const resetControl = L.control({ position: "topright" });
      resetControl.onAdd = () => {
        const button = L.DomUtil.create("button", "leaflet-reset-view");
        button.type = "button";
        button.textContent = "Reset View";
        button.title = "Return to Ilocos Sur";
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.on(button, "click", () => map.fitBounds(bounds, { padding: [34, 34], maxZoom: 10 }));
        return button;
      };
      resetControl.addTo(map);
      const colors = { none: "#dc2626", low: "#2563eb", medium: "#f59e0b", high: "#15803d" };
      const max = Math.max(1, ...payload.groups.map((group) => Number(group.value || 0)));
      payload.groups.forEach((group) => {
        const value = Number(group.value || 0);
        const radius = value ? Math.min(10, Math.max(6, 6 + (value / max) * 4)) : 5.5;
        const intensityLabel = group.intensity === "none" ? "No SETUP Project" : group.intensity.charAt(0).toUpperCase() + group.intensity.slice(1);
        const marker = L.circleMarker(group.coordinates, {
          radius,
          color: group.selected ? "#0f2f66" : "#ffffff",
          weight: group.selected ? 4 : 2,
          fillColor: colors[group.intensity] || colors.none,
          fillOpacity: 0.88
        }).addTo(map);
        marker.bindTooltip(`<b>${escapeHtml(group.label)}</b><br>SETUP Projects: ${formatNumber(value)}<br>Firms with SETUP: ${formatNumber(value)}<br>Status: ${escapeHtml(intensityLabel)}`, { sticky: true });
        marker.bindPopup(`<b>${escapeHtml(group.label)}</b><br>SETUP Projects: ${formatNumber(value)}<br>Firms with SETUP: ${formatNumber(value)}<br>Status: ${escapeHtml(intensityLabel)}<br>${escapeHtml(group.district)}`);
        marker.on("mouseover", () => marker.setStyle({ weight: 4, color: "#0f2f66" }));
        marker.on("mouseout", () => marker.setStyle({ weight: group.selected ? 4 : 2, color: group.selected ? "#0f2f66" : "#ffffff" }));
        marker.on("click", () => navigate(group.link.replace(/^#/, "")));
      });
      if (payload.selected) {
        const selected = payload.groups.find((group) => group.selected);
        if (selected) map.setView(selected.coordinates, Math.max(map.getZoom(), 11), { animate: false });
      }
      setTimeout(() => map.invalidateSize(), 80);
    })
    .catch(() => {
      const list = payload.groups.length
        ? payload.groups.map((group) => `<p><b>${escapeHtml(group.label)}</b><span>${formatNumber(group.value)} firms · ${Number(group.value || 0) ? escapeHtml(group.intensity) : "No SETUP Project"}</span></p>`).join("")
        : `<div class="dashboard-empty">No municipality coordinates available for the current filters.</div>`;
      container.innerHTML = `<div class="analytics-map-fallback"><strong>Map unavailable</strong><span>Leaflet or OpenStreetMap tiles could not load. Municipality counts remain available below.</span>${list}</div>${container.querySelector(".analytics-map-legend")?.outerHTML || ""}`;
    });
}

function renderSetupRefundDashboard() {
  const query = getQuery();
  const filters = {
    year: query.year || "",
    asOf: query.asOf || todayIso(),
    municipality: query.municipality || "",
    district: query.district || "",
    businessSector: query.businessSector || "",
    officer: query.officer || "",
    phase: query.phase || "",
    cooperatorId: query.cooperatorId || "",
    projectStatus: query.projectStatus || ""
  };
  const summary = dashboardService.getSetupRefundDashboard(filters);
  const cards = [
    ["Total SETUP Cooperators", summary.totalSetupCooperators || summary.totalSetupCustomers, "All non-archived cooperators with SETUP", "users", ""],
    ["Active SETUP Refund", summary.activeSetupRefundCount, `Outstanding ${formatCurrency(summary.activeSetupOutstanding)}`, "cash", ""],
    ["Monthly Target Refund for Collection", formatCurrency(summary.monthlyTarget), `Target month ${formatDate(summary.selectedPeriod?.start)}`, "calendar", ""],
    ["Monthly Collection as of Today", formatCurrency(summary.monthlyCollection), `Valid collections through ${formatDate(filters.asOf)}`, "check", ""]
  ];
  const delinquentRows = summary.delinquentPayors;
  return `
    ${pageHeader({
      title: "SETUP Refund",
      eyebrow: "Monitoring and Evaluation",
      description: "Collection target, valid monthly collection, refund performance percentage, and active overdue SETUP accounts.",
      actions: `${buttonLink("/collections/new", "Record Payment", "cash", "primary")}<button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")}<span>Print</span></button>`
    })}
    <section class="control-panel setup-filter-panel">
      <label>Year <select data-setup-filter="year"><option value="" ${filters.year ? "" : "selected"}>All years</option>${Array.from(new Set([filters.year, ...repository.getSnapshot().beneficiaries.map((item) => String(item.project?.projectYear || "")).filter(Boolean)])).sort((a, b) => Number(b) - Number(a)).map((year) => `<option value="${year}" ${String(year) === String(filters.year) ? "selected" : ""}>${year}</option>`).join("")}</select></label>
      <label>As of Date <input type="date" data-setup-filter="asOf" value="${escapeHtml(filters.asOf)}" /></label>
      <label>Cooperator <select data-setup-filter="cooperatorId"><option value="">All</option>${beneficiaryService.list().map((item) => ({ id: item.id, name: getCooperatorView(item).firmName })).sort((a, b) => a.name.localeCompare(b.name)).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === filters.cooperatorId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <label>Municipality <select data-setup-filter="municipality"><option value="">All</option>${lookups.municipalities.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>District <select data-setup-filter="district"><option value="">All</option>${lookups.districts.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Business Sector <select data-setup-filter="businessSector"><option value="">All</option>${lookups.businessSectors.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Assigned Project Officer <select data-setup-filter="officer"><option value="">All</option>${summary.filters.officers.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.officer ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>SETUP Phase <select data-setup-filter="phase"><option value="">All</option>${summary.filters.phases.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.phase ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Project Status <select data-setup-filter="projectStatus"><option value="">All</option>${lookups.setupProjectStatuses.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.projectStatus ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <button class="btn btn-ghost" type="button" data-action="reset-setup-dashboard">Reset filters</button>
      <span class="last-updated">Last updated ${escapeHtml(summary.lastUpdated)}</span>
      ${filterChips(Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && !(key === "year" && value === todayIso().slice(0, 4)) && !(key === "asOf" && value === todayIso()))))}
    </section>
    <section class="summary-grid setup-kpis">${cards.map(([label, value, context, iconName]) => summaryCard({ label, value: String(value), context, iconName })).join("")}</section>
    ${setupPaymentAnalyticsPanel(summary.paymentAnalytics)}
    ${dashboardTableCard({
      title: "SETUP Payment Standing",
      description: `Per-cooperator payment standing as of ${formatDate(filters.asOf)}.`,
      rows: summary.paymentAnalytics.rows,
      columns: [
        { key: "firmName", label: "Cooperator/Firm", render: (row) => `<a href="/beneficiaries/${row.id}" data-link>${escapeHtml(row.firmName)}</a>` },
        { key: "projectPhase", label: "Project/Phase", render: (row) => escapeHtml(row.projectPhase) },
        { key: "totalFund", label: "SETUP Total Fund", align: "right", render: (row) => formatCurrency(row.totalFund) },
        { key: "monthlyRefund", label: "Monthly Refund", align: "right", render: (row) => formatCurrency(row.monthlyRefund) },
        { key: "expectedDueAsOf", label: `Expected Due as of ${formatDate(filters.asOf)}`, align: "right", render: (row) => formatCurrency(row.expectedDueAsOf) },
        { key: "totalPaid", label: "Total Amount Paid", align: "right", render: (row) => formatCurrency(row.totalPaid) },
        { key: "remainingDueThisMonth", label: "Remaining Due This Month", align: "right", render: (row) => formatCurrency(row.remainingDueThisMonth) },
        { key: "advancePayment", label: "Advance Payment", align: "right", render: (row) => formatCurrency(row.advancePayment) },
        { key: "remainingBalance", label: "Remaining Balance", align: "right", render: (row) => formatCurrency(row.remainingBalance) },
        { key: "paymentPercentage", label: "Payment %", align: "right", render: (row) => `${Number(row.paymentPercentage || 0).toFixed(1)}%` },
        { key: "status", label: "Status", render: (row) => statusBadge(row.status) }
      ],
      emptyMessage: "No SETUP refund payment analytics available.",
      className: "setup-payment-standing-table"
    })}
    ${collectionPerformanceChart(summary.monthlyPerformance, filters.year)}
    <details class="panel underlying-data">
      <summary>Show underlying monthly values</summary>
      ${dashboardTableCard({
        title: "Monthly Values",
        description: "Values used for Monthly SETUP Refund Performance.",
        rows: summary.monthlyPerformance,
        columns: [
          { key: "label", label: "Month", render: (row) => escapeHtml(row.label) },
          { key: "target", label: "Target Refund", align: "right", render: (row) => formatCurrency(row.target) },
          { key: "actual", label: "Collected Refund", align: "right", render: (row) => formatCurrency(row.actual) },
          { key: "rate", label: "Refund Performance", align: "right", render: (row) => (row.noTarget ? "0.0%" : `${Number(row.rate || 0).toFixed(1)}%`) }
        ]
      })}
    </details>
    ${dashboardTableCard({
      title: "List of Delinquent Payors",
      description: "Only unpaid or partially unpaid monthly obligations whose due month has passed are counted.",
      rows: delinquentRows,
      columns: [
        { key: "firmName", label: "Name of Firm", render: (row) => `<strong class="dashboard-row-label">${escapeHtml(row.firmName)}</strong>` },
        { key: "totalOverdueArrears", label: "Total Overdue Arrears", align: "right", render: (row) => formatCurrency(row.totalOverdueArrears) },
        { key: "delayedMonths", label: "Delayed Since", render: (row) => `${row.delayedMonths} ${row.delayedMonths === 1 ? "month" : "months"}` },
        { key: "actions", label: "Action", render: (row) => `<a class="btn btn-secondary" href="/beneficiaries/${row.id}" data-link>View Account</a>` }
      ],
      emptyMessage: "No active SETUP accounts are currently overdue.",
      className: "delinquent-panel"
    })}
    <section class="dashboard-grid supporting-charts">
      ${svgChartCard({ title: "SETUP Accounts by Business Sector", data: summary.charts.byBusinessSector })}
      ${svgChartCard({ title: "SETUP Accounts by District", data: summary.charts.byDistrict })}
      ${svgChartCard({ title: "SETUP Project Status Overview", data: summary.charts.byProjectStatus })}
    </section>
  `;
}

function setupPaymentAnalyticsPanel(analytics = {}) {
  const totalFund = Number(analytics.totalFund || 0);
  const totalPaid = Number(analytics.totalPaid || 0);
  const remainingBalance = Number(analytics.remainingBalance || 0);
  const advancePayment = Number(analytics.advancePayment || 0);
  const paymentPercentage = Number(analytics.paymentPercentage || 0);
  const tooltip = `SETUP Total Fund: ${formatCurrency(totalFund)}; Total Amount Paid: ${formatCurrency(totalPaid)}; Remaining Balance: ${formatCurrency(remainingBalance)}; Payment Progress: ${paymentPercentage.toFixed(1)}%`;
  const chartRows = [
    { label: "SETUP Total Fund", value: totalFund, className: "is-fund" },
    { label: "Total Amount Paid", value: totalPaid, className: "is-paid" },
    { label: "Remaining Balance", value: remainingBalance, className: "is-balance" }
  ];
  const chartWidth = 760;
  const chartHeight = 280;
  const left = 108;
  const right = 28;
  const top = 28;
  const bottom = 206;
  const plotWidth = chartWidth - left - right;
  const plotHeight = bottom - top;
  const chartMax = Math.max(...chartRows.map((row) => row.value), 1);
  const slot = plotWidth / chartRows.length;
  const barWidth = 64;
  return `
    <section class="panel setup-payment-analytics" aria-label="SETUP Total Fund vs Total Amount Paid">
      <div class="panel-head">
        <div>
          <h2>SETUP Total Fund vs Total Amount Paid</h2>
          <p>Payment progress as of ${formatDate(analytics.asOf || todayIso())}. Valid payments are counted once by payment amount.</p>
        </div>
        <strong class="payment-progress-value">${paymentPercentage.toFixed(1)}% paid</strong>
      </div>
      <div class="payment-bar-chart-wrap" tabindex="0">
        <svg class="payment-bar-chart" role="img" aria-label="${escapeHtml(tooltip)}" viewBox="0 0 ${chartWidth} ${chartHeight}">
          <title>${escapeHtml(tooltip)}</title>
          ${Array.from({ length: 5 }, (_, index) => {
            const value = chartMax - (index / 4) * chartMax;
            const y = top + (index / 4) * plotHeight;
            return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${chartWidth - right}" y2="${y.toFixed(1)}" class="payment-chart-grid"></line><text class="payment-chart-axis-label" x="${left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatCurrency(value))}</text>`;
          }).join("")}
          <line x1="${left}" y1="${bottom}" x2="${chartWidth - right}" y2="${bottom}" class="payment-chart-axis"></line>
          ${chartRows.map((row, index) => {
            const x = left + index * slot + slot / 2 - barWidth / 2;
            const rawHeight = (row.value / chartMax) * plotHeight;
            const hasValue = row.value > 0.01;
            const barHeight = hasValue ? Math.max(4, rawHeight) : 0;
            const y = bottom - barHeight;
            const labelInside = hasValue && y < top + 26;
            const labelY = hasValue ? (labelInside ? y + 22 : y - 10) : bottom - 8;
            return `<g tabindex="0" aria-label="${escapeHtml(`${row.label}: ${formatCurrency(row.value)}`)}">
              <title>${escapeHtml(`${row.label}: ${formatCurrency(row.value)}`)}</title>
              ${hasValue ? `<rect class="${escapeHtml(row.className)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" rx="5"></rect>` : `<line x1="${x.toFixed(1)}" y1="${bottom}" x2="${(x + barWidth).toFixed(1)}" y2="${bottom}" class="zero-bar-marker"></line>`}
              <text class="payment-chart-value${labelInside ? " is-inside" : ""}" x="${(x + barWidth / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle">${escapeHtml(formatCurrency(row.value))}</text>
              <text class="payment-chart-label" x="${(x + barWidth / 2).toFixed(1)}" y="${bottom + 32}" text-anchor="middle">${escapeHtml(row.label)}</text>
            </g>`;
          }).join("")}
        </svg>
      </div>
      <div class="payment-analytics-metrics">
        <span><b>Expected Due as of ${formatDate(analytics.asOf || todayIso())}</b>${formatCurrency(analytics.expectedDueAsOf || 0)}</span>
        <span><b>Remaining Due This Month</b>${formatCurrency(analytics.remainingDueThisMonth || 0)}</span>
        <span><b>Advance Payment</b>${formatCurrency(advancePayment)}</span>
      </div>
    </section>
  `;
}

function bindSetupRefundDashboard() {
  document.querySelectorAll("[data-setup-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-setup-filter]").forEach((item) => {
        filters[item.dataset.setupFilter] = item.value;
      });
      setQuery("/setup-refund", filters);
    });
  });
  document.querySelector("[data-action='reset-setup-dashboard']")?.addEventListener("click", () => navigate("/setup-refund"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
}

function statusReportFilters(query = {}) {
  const officerOptions = [...new Set(beneficiaryService.list().map((item) => getCooperatorView(item).setup.assignedProjectOfficer).filter(Boolean))].sort();
  const cooperatorOptions = beneficiaryService.list().map((item) => ({ id: item.id, name: getCooperatorView(item).firmName })).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <section class="control-panel report-filters">
      <label>As-of date <input type="date" data-pis-filter="asOf" value="${escapeHtml(query.asOf || todayIso())}" /></label>
      <label>Cooperator <select data-pis-filter="cooperatorId"><option value="">All</option>${cooperatorOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === query.cooperatorId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <label>Project year <select data-pis-filter="year"><option value="">All</option>${yearOptions(query.year)}</select></label>
      <label>Municipality <select data-pis-filter="municipality"><option value="">All</option>${lookups.municipalities.map((item) => `<option ${item === query.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>District <select data-pis-filter="district"><option value="">All</option>${lookups.districts.map((item) => `<option ${item === query.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Business sector <select data-pis-filter="businessSector"><option value="">All</option>${lookups.businessSectors.map((item) => `<option ${item === query.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Assigned Project Officer <select data-pis-filter="officer"><option value="">All</option>${officerOptions.map((item) => `<option ${item === query.officer ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Project status <select data-pis-filter="projectStatus"><option value="">All</option>${lookups.setupProjectStatuses.map((item) => `<option ${item === query.projectStatus ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <button class="btn btn-ghost" type="button" data-action="reset-pis-report">Reset filters</button>
    </section>
  `;
}

function renderStatusReportPis() {
  const query = getQuery();
  const type = "SETUP Project Report";
  const rows = reportService.getPreview(type, query);
  return `
    <div class="print-report-page">
      ${pageHeader({ title: "Status Report PIS", eyebrow: "Monitoring and Evaluation", description: "SETUP project status report sourced from current cooperator and project records.", actions: "" })}
      ${statusReportFilters(query)}
      <section class="action-row">
        <button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")} Print</button>
        <button class="btn btn-secondary" type="button" data-action="export-pis-csv">${icon("download")} Export CSV</button>
        <button class="btn btn-secondary" type="button" data-action="export-pis-xlsx">Export Excel</button>
        <button class="btn btn-secondary" type="button" data-action="export-pis-pdf">Export PDF</button>
      </section>
      ${reportPreview("Status Report PIS", query, rows)}
    </div>
  `;
}

function bindStatusReportPis() {
  document.querySelectorAll("[data-pis-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-pis-filter]").forEach((item) => {
        filters[item.dataset.pisFilter] = item.value;
      });
      setQuery("/status-report-pis", filters);
    });
  });
  document.querySelector("[data-action='reset-pis-report']")?.addEventListener("click", () => navigate("/status-report-pis"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
  document.querySelector("[data-action='export-pis-csv']")?.addEventListener("click", () => {
    const rows = reportService.getPreview("SETUP Project Report", getQuery());
    const columns = Object.keys(rows[0] || {});
    downloadCsv("status-report-pis.csv", [columns, ...rows.map((row) => columns.map((key) => row[key]))]);
  });
  document.querySelector("[data-action='export-pis-xlsx']")?.addEventListener("click", () => {
    downloadXlsx("status-report-pis.xlsx", "Status Report PIS", reportService.getPreview("SETUP Project Report", getQuery()));
  });
  document.querySelector("[data-action='export-pis-pdf']")?.addEventListener("click", () => {
    downloadPdf("status-report-pis.pdf", "Status Report PIS", reportService.getPreview("SETUP Project Report", getQuery()));
  });
}

function safeDivide(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? top / bottom : null;
}

function productivityPercent(value) {
  return value === null || !Number.isFinite(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
}

function productivityDecimal(value) {
  return value === null || !Number.isFinite(Number(value)) ? "N/A" : Number(value).toFixed(2);
}

function computeFinalProductivity(grossSales, productionCost) {
  return safeDivide(grossSales, productionCost);
}

function computeProductionCostPercentage(productionCost, grossSales) {
  const value = safeDivide(productionCost, grossSales);
  return value === null ? null : value * 100;
}

function computeProductivityImprovement(finalProductivity, initialProductivity) {
  if (finalProductivity === null || !Number.isFinite(Number(finalProductivity))) return null;
  return Number(finalProductivity) - Number(initialProductivity || 0);
}

function computeProductivityImprovementPercentage(finalProductivity, initialProductivity) {
  const initial = Number(initialProductivity || 0);
  if (initial <= 0 || finalProductivity === null || !Number.isFinite(Number(finalProductivity))) return null;
  return ((Number(finalProductivity) - initial) / initial) * 100;
}

function monthShortLabel(value = "") {
  const month = Number(String(value || "").slice(5, 7));
  return month ? new Date(2026, month - 1, 1).toLocaleDateString("en-PH", { month: "short" }).toUpperCase() : "N/A";
}

function productivityRowsForKpi(filters = {}, monitoredIds = new Set()) {
  const includeArchived = filters.includeArchived === "1";
  return salesMonitoringService
    .list({ includeArchived })
    .filter((record) => record.cooperatorId && monitoredIds.has(record.cooperatorId))
    .filter((record) => {
      if (filters.reportingYear && !String(record.reportingMonth || "").startsWith(`${filters.reportingYear}-`)) return false;
      if (filters.reportingMonth && record.monthKey !== filters.reportingMonth) return false;
      if (filters.assistanceYear && String(record.assistanceYear) !== String(filters.assistanceYear)) return false;
      if (filters.cooperatorId && record.cooperatorId !== filters.cooperatorId) return false;
      if (filters.assignedStaff && record.assignedStaff !== filters.assignedStaff) return false;
      if (filters.businessSector && record.businessSector !== filters.businessSector) return false;
      if (filters.municipality && record.municipality !== filters.municipality) return false;
      if (filters.projectYear && String(record.projectYear || "") !== String(filters.projectYear)) return false;
      if (filters.employmentStatus && record.employmentStatus !== filters.employmentStatus) return false;
      return true;
    })
    .map((record) => {
      const finalProductivity = computeFinalProductivity(record.grossSales, record.monthlyTotalProductionCost);
      const productionCostPercent = record.productionCostPercentage > 0
        ? Number(record.productionCostPercentage)
        : computeProductionCostPercentage(record.monthlyTotalProductionCost, record.grossSales);
      const productivityImprovement = computeProductivityImprovement(finalProductivity, record.initialProductivity);
      const productivityImprovementPercent = computeProductivityImprovementPercentage(finalProductivity, record.initialProductivity);
      return {
        ...record,
        finalProductivity,
        productionCostPercent,
        productivityImprovement,
        productivityImprovementPercent
      };
    });
}

function summarizeProductivity(records = []) {
  const grossSales = records.reduce((sum, record) => sum + Number(record.grossSales || 0), 0);
  const productionCost = records.reduce((sum, record) => sum + Number(record.monthlyTotalProductionCost || 0), 0);
  const initialRows = records.filter((record) => Number(record.initialProductivity || 0) > 0);
  const averageInitial = initialRows.length ? initialRows.reduce((sum, record) => sum + Number(record.initialProductivity || 0), 0) / initialRows.length : null;
  const averageFinal = computeFinalProductivity(grossSales, productionCost);
  const improvementPercent = computeProductivityImprovementPercentage(averageFinal, averageInitial);
  const productionCostPercent = computeProductionCostPercentage(productionCost, grossSales);
  return {
    grossSales,
    productionCost,
    averageInitial,
    averageFinal,
    improvementPercent,
    productionCostPercent
  };
}

function groupProductivityByMonth(records = []) {
  const monthOrder = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  return monthOrder.map((month) => {
    const rows = records.filter((record) => String(record.reportingMonth || "").slice(5, 7) === month);
    const grossSales = rows.reduce((sum, record) => sum + Number(record.grossSales || 0), 0);
    const productionCost = rows.reduce((sum, record) => sum + Number(record.monthlyTotalProductionCost || 0), 0);
    const initialRows = rows.filter((record) => Number(record.initialProductivity || 0) > 0);
    const initial = initialRows.length ? initialRows.reduce((sum, record) => sum + Number(record.initialProductivity || 0), 0) / initialRows.length : null;
    const final = computeFinalProductivity(grossSales, productionCost);
    return {
      label: new Date(2026, Number(month) - 1, 1).toLocaleDateString("en-PH", { month: "short" }).toUpperCase(),
      initial,
      final,
      improvementPercent: computeProductivityImprovementPercentage(final, initial)
    };
  });
}

function groupProductivityBySector(records = []) {
  const map = new Map();
  records.forEach((record) => {
    const key = record.businessSector || "Not classified";
    const row = map.get(key) || { businessSector: key, grossSales: 0, productionCost: 0, initialTotal: 0, initialCount: 0 };
    row.grossSales += Number(record.grossSales || 0);
    row.productionCost += Number(record.monthlyTotalProductionCost || 0);
    if (Number(record.initialProductivity || 0) > 0) {
      row.initialTotal += Number(record.initialProductivity || 0);
      row.initialCount += 1;
    }
    map.set(key, row);
  });
  return [...map.values()]
    .map((row) => {
      const initial = row.initialCount ? row.initialTotal / row.initialCount : null;
      const final = computeFinalProductivity(row.grossSales, row.productionCost);
      return {
        ...row,
        finalProductivity: final,
        productivityImprovementPercent: computeProductivityImprovementPercentage(final, initial)
      };
    })
    .sort((a, b) => b.grossSales - a.grossSales || a.businessSector.localeCompare(b.businessSector));
}

function productivityChart(rows = []) {
  const hasData = rows.some((row) => Number(row.initial || 0) > 0 || Number(row.final || 0) > 0);
  if (!hasData) return `<section class="panel chart-card"><div class="panel-head"><div><h2>Initial Productivity vs Final Productivity</h2><p>Final productivity is gross sales divided by monthly total production cost.</p></div></div><div class="chart-empty">No productivity data available for the selected KPI filters.</div></section>`;
  const left = 84;
  const right = 44;
  const top = 44;
  const bottom = 250;
  const plotHeight = bottom - top;
  const slot = 92;
  const plotWidth = rows.length * slot;
  const width = left + plotWidth + right;
  const height = 340;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.initial || 0), Number(row.final || 0)]));
  const summary = rows.map((row) => `${row.label}: initial ${productivityDecimal(row.initial)}, final ${productivityDecimal(row.final)}, improvement ${productivityPercent(row.improvementPercent)}`).join("; ");
  return `
    <section class="panel chart-card productivity-chart-card">
      <div class="panel-head"><div><h2>Initial Productivity vs Final Productivity</h2><p>Final productivity = declared gross sales / monthly total production cost.</p></div></div>
      <div class="chart-legend"><span><i class="legend-rate"></i>Initial Productivity</span><span><i class="legend-target"></i>Final Productivity</span></div>
      <div class="performance-chart-scroll" tabindex="0" aria-label="Scrollable productivity chart">
        <svg class="responsive-chart performance-chart" role="img" aria-label="${escapeHtml(summary)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <title>${escapeHtml(summary)}</title>
          ${Array.from({ length: 5 }, (_, index) => {
            const y = top + (index / 4) * plotHeight;
            const value = max - (index / 4) * max;
            return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" class="chart-grid-line"></line><text x="${left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(productivityDecimal(value))}</text>`;
          }).join("")}
          <text x="18" y="${top + plotHeight / 2}" transform="rotate(-90 18 ${top + plotHeight / 2})" class="chart-axis-title">Productivity</text>
          ${rows.map((row, index) => {
            const x = left + index * slot + 24;
            const initialHeight = (Number(row.initial || 0) / max) * plotHeight;
            const finalHeight = (Number(row.final || 0) / max) * plotHeight;
            return `<g tabindex="0" aria-label="${escapeHtml(`${row.label}: initial ${productivityDecimal(row.initial)}, final ${productivityDecimal(row.final)}`)}">
              <rect x="${x}" y="${(bottom - initialHeight).toFixed(1)}" width="18" height="${Math.max(2, initialHeight).toFixed(1)}" rx="3" class="reference-actual-bar"></rect>
              <rect x="${x + 24}" y="${(bottom - finalHeight).toFixed(1)}" width="18" height="${Math.max(2, finalHeight).toFixed(1)}" rx="3" class="reference-target-bar"></rect>
              <text class="reference-x-label" x="${x + 21}" y="${bottom + 34}" text-anchor="middle">${escapeHtml(row.label)}</text>
              <text class="reference-point-value" x="${x + 21}" y="${bottom + 56}" text-anchor="middle">${escapeHtml(productivityPercent(row.improvementPercent))}</text>
            </g>`;
          }).join("")}
        </svg>
      </div>
    </section>
  `;
}

function kpiProductivitySection(records = []) {
  const summary = summarizeProductivity(records);
  const monthlyRows = groupProductivityByMonth(records);
  const sectorRows = groupProductivityBySector(records);
  const cards = [
    { label: "Average Initial Productivity", value: productivityDecimal(summary.averageInitial), context: "Average baseline from filtered records", iconName: "dashboard" },
    { label: "Average Final Productivity", value: productivityDecimal(summary.averageFinal), context: "Total gross sales divided by total production cost", iconName: "check" },
    { label: "Average Productivity Improvement %", value: productivityPercent(summary.improvementPercent), context: "Compared with average initial productivity", iconName: "check" },
    { label: "Total Gross Sales", value: formatCurrency(summary.grossSales), context: "Declared gross sales for the month", iconName: "cash" },
    { label: "Total Production Cost", value: formatCurrency(summary.productionCost), context: "Monthly total production cost", iconName: "cash" },
    { label: "Average Production Cost %", value: productivityPercent(summary.productionCostPercent), context: "Production cost divided by gross sales", iconName: "dashboard" }
  ];
  return `
    <section class="kpi-productivity-section">
      <div class="section-heading"><h2>% Improvement of Productivity</h2><p>Productivity KPI uses existing sales monitoring records only.</p></div>
      <section class="summary-grid setup-kpis">${cards.map((item) => summaryCard(item)).join("")}</section>
      ${productivityChart(monthlyRows)}
      ${dashboardTableCard({
        title: "Productivity Breakdown",
        description: "Final productivity is computed as gross sales divided by monthly total production cost.",
        rows: records,
        columns: [
          { key: "assignedStaff", label: "Assigned Staff", render: (row) => escapeHtml(row.assignedStaff || "Unassigned") },
          { key: "assistanceYear", label: "Assistance Year", render: (row) => escapeHtml(row.assistanceYear || "") },
          { key: "firmName", label: "Name of Firm", render: (row) => escapeHtml(row.firmName || "Not provided") },
          { key: "reportingMonth", label: "Reporting Month", render: (row) => escapeHtml(monthShortLabel(row.reportingMonth)) },
          { key: "grossSales", label: "Gross Sales", align: "right", render: (row) => formatCurrency(row.grossSales) },
          { key: "productionCost", label: "Monthly Total Production Cost", align: "right", render: (row) => formatCurrency(row.monthlyTotalProductionCost) },
          { key: "productionCostPercent", label: "Production Cost %", align: "right", render: (row) => productivityPercent(row.productionCostPercent) },
          { key: "initialProductivity", label: "Initial Productivity", align: "right", render: (row) => productivityDecimal(row.initialProductivity) },
          { key: "finalProductivity", label: "Final Productivity", align: "right", render: (row) => productivityDecimal(row.finalProductivity) },
          { key: "productivityImprovement", label: "Productivity Improvement", align: "right", render: (row) => productivityDecimal(row.productivityImprovement) },
          { key: "productivityImprovementPercent", label: "Productivity Improvement %", align: "right", render: (row) => productivityPercent(row.productivityImprovementPercent) },
          { key: "remarks", label: "Remarks", render: (row) => escapeHtml(row.remarks || "") }
        ],
        emptyMessage: "No productivity records match the selected KPI filters."
      })}
      ${dashboardTableCard({
        title: "Productivity by Business Sector",
        rows: sectorRows,
        columns: [
          { key: "businessSector", label: "Business Sector", render: (row) => escapeHtml(row.businessSector || "Not classified") },
          { key: "grossSales", label: "Total Gross Sales", align: "right", render: (row) => formatCurrency(row.grossSales) },
          { key: "productionCost", label: "Total Production Cost", align: "right", render: (row) => formatCurrency(row.productionCost) },
          { key: "finalProductivity", label: "Final Productivity", align: "right", render: (row) => productivityDecimal(row.finalProductivity) },
          { key: "improvement", label: "Productivity Improvement %", align: "right", render: (row) => productivityPercent(row.productivityImprovementPercent) }
        ],
        emptyMessage: "No business sector productivity data available."
      })}
    </section>
  `;
}

function renderKpiPage() {
  const query = getQuery();
  const asOf = query.asOf || todayIso();
  const kpiSummary = dashboardService.getKpiMonitoring({ ...query, asOf });
  const setupSummary = dashboardService.getSetupRefundDashboard({ ...query, asOf });
  const monitoredIds = new Set(kpiSummary.allRefundRecords.map((item) => item.id));
  const productivityFilters = {
    reportingYear: query.reportingYear || "",
    reportingMonth: query.reportingMonth || "",
    assistanceYear: query.assistanceYear || "",
    cooperatorId: query.cooperatorId || "",
    assignedStaff: query.assignedStaff || "",
    businessSector: query.businessSector || "",
    municipality: query.municipality || "",
    projectYear: query.projectYear || "",
    employmentStatus: query.employmentStatus || "",
    includeArchived: query.includeArchived || ""
  };
  const productivityRecords = productivityRowsForKpi(productivityFilters, monitoredIds);
  const employmentSummary = salesMonitoringService.employmentSummary(productivityRecords);
  const overdueTotal = kpiSummary.delinquentRecords.reduce((sum, item) => sum + Number(item.totalOverdueArrears || 0), 0);
  const performance = setupSummary.monthlyTarget > 0 ? percent(setupSummary.monthlyCollection, setupSummary.monthlyTarget) : 0;
  const cooperatorOptions = kpiSummary.allRefundRecords
    .map((item) => ({ id: item.id, name: item.cooperator.firmName }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const allProductivityRecords = productivityRowsForKpi({ includeArchived: "1" }, monitoredIds);
  const filterOptions = {
    reportingYears: [...new Set(allProductivityRecords.map((item) => String(item.reportingMonth || "").slice(0, 4)).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    reportingMonths: [...new Set(allProductivityRecords.map((item) => item.monthKey).filter(Boolean))].sort(),
    assistanceYears: [...new Set(allProductivityRecords.map((item) => String(item.assistanceYear || "")).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    staff: [...new Set(allProductivityRecords.map((item) => item.assignedStaff).filter(Boolean))].sort(),
    sectors: [...new Set(allProductivityRecords.map((item) => item.businessSector || "Not classified").filter(Boolean))].sort(),
    municipalities: [...new Set(allProductivityRecords.map((item) => item.municipality).filter(Boolean))].sort(),
    projectYears: [...new Set(allProductivityRecords.map((item) => String(item.projectYear || "")).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    employmentStatuses: [...new Set(allProductivityRecords.map((item) => item.employmentStatus).filter(Boolean))].sort()
  };
  const rows = [
    { label: "SETUP Refund Performance", value: `${performance.toFixed(1)}%`, context: `${formatCurrency(setupSummary.monthlyCollection)} collected / ${formatCurrency(setupSummary.monthlyTarget)} target`, iconName: "check" },
    { label: "Monitored Refund Firms", value: String(kpiSummary.monitoredFirmCount), context: "Only firms with existing SETUP refund", iconName: "users" },
    { label: "Overall Collection Rate", value: `${kpiSummary.collectionRate.toFixed(1)}%`, context: "Collected versus monitored repayable", iconName: "dashboard" },
    { label: "Active SETUP Refund", value: String(kpiSummary.activeRefundCount), context: `Outstanding ${formatCurrency(kpiSummary.outstandingBalance)}`, iconName: "cash" },
    { label: "Overdue Arrears", value: formatCurrency(overdueTotal), context: `${kpiSummary.delinquentRecords.length} delinquent account(s)`, iconName: "alert" },
    { label: "Completed, Retained", value: String(kpiSummary.completedRetainedCount), context: "Monitored until year-end", iconName: "check" },
    { label: "Archive Eligible", value: String(kpiSummary.archiveEligibleCount), context: "Completed before this year", iconName: "archive" },
    { label: "Past Due", value: formatCurrency(kpiSummary.pastDue), context: "Monitored accounts needing follow-up", iconName: "alert" },
    { label: "Additional Jobs Generated", value: String(employmentSummary.additionalJobs), context: `${employmentSummary.employmentGrowth.toFixed(1)}% employment growth`, iconName: "users" },
    { label: "Firms with Increased Employment", value: String(employmentSummary.firmsIncreased), context: `${employmentSummary.firmsNoIncrease} firm(s) with no increase`, iconName: "check" }
  ];
  return `
    ${pageHeader({ title: "KPI", eyebrow: "Monitoring and Evaluation", description: "Only firms with existing SETUP refund are monitored. Completed refunds remain monitored until year-end.", actions: `<button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")}<span>Print</span></button>` })}
    <section class="control-panel">
      <label>As-of date <input type="date" data-kpi-filter="asOf" value="${escapeHtml(asOf)}" /></label>
      <label>Cooperator <select data-kpi-filter="cooperatorId"><option value="">All monitored refund firms</option>${cooperatorOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === query.cooperatorId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <label>Reporting Year <select data-kpi-filter="reportingYear"><option value="">All years</option>${filterOptions.reportingYears.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.reportingYear ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Reporting Month <select data-kpi-filter="reportingMonth"><option value="">All months</option>${filterOptions.reportingMonths.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.reportingMonth ? "selected" : ""}>${escapeHtml(monthShortLabel(item))} ${escapeHtml(String(item).slice(0, 4))}</option>`).join("")}</select></label>
      <label>Assistance Year <select data-kpi-filter="assistanceYear"><option value="">All assistance years</option>${filterOptions.assistanceYears.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.assistanceYear ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Assigned Staff <select data-kpi-filter="assignedStaff"><option value="">All staff</option>${filterOptions.staff.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.assignedStaff ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Business Sector <select data-kpi-filter="businessSector"><option value="">All sectors</option>${filterOptions.sectors.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Municipality <select data-kpi-filter="municipality"><option value="">All municipalities</option>${filterOptions.municipalities.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Project Year <select data-kpi-filter="projectYear"><option value="">All project years</option>${filterOptions.projectYears.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.projectYear ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Status <select data-kpi-filter="employmentStatus"><option value="">All statuses</option>${filterOptions.employmentStatuses.map((item) => `<option value="${escapeHtml(item)}" ${item === productivityFilters.employmentStatus ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Archived <select data-kpi-filter="includeArchived"><option value="" ${productivityFilters.includeArchived ? "" : "selected"}>Active only</option><option value="1" ${productivityFilters.includeArchived === "1" ? "selected" : ""}>Include archived</option></select></label>
      <button class="btn btn-ghost" type="button" data-action="reset-kpi">Reset filters</button>
    </section>
    <section class="summary-grid setup-kpis">${rows.map((item) => summaryCard(item)).join("")}</section>
    ${kpiProductivitySection(productivityRecords)}
    ${collectionPerformanceChart(setupSummary.monthlyPerformance, query.year || "")}
    ${dashboardTableCard({
      title: "KPI Refund Monitoring",
      description: "Firms without valid SETUP refund records are excluded. Completed refunds are retained until December 31 of the completion year.",
      rows: [...kpiSummary.records, ...kpiSummary.archiveEligibleRecords],
      columns: [
        { key: "firm", label: "Firm", render: (row) => `<a href="/beneficiaries/${row.id}" data-link>${escapeHtml(row.cooperator.firmName)}</a>` },
        { key: "cooperator", label: "Cooperator", render: (row) => escapeHtml(row.cooperator.cooperatorName) },
        { key: "phase", label: "Phase", render: (row) => escapeHtml(row.phase?.phase || "Phase I") },
        { key: "status", label: "Monitoring Status", render: (row) => statusBadge(row.monitoringStatus) },
        { key: "completion", label: "Completion Date", render: (row) => (row.completionDate ? formatDate(row.completionDate) : "Ongoing") },
        { key: "outstanding", label: "Outstanding", align: "right", render: (row) => formatCurrency(row.financials.outstandingBalance) },
        { key: "pastDue", label: "Past Due", align: "right", render: (row) => formatCurrency(row.financials.pastDue) }
      ]
    })}
  `;
}

function bindKpiPage() {
  document.querySelectorAll("[data-kpi-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-kpi-filter]").forEach((item) => {
        filters[item.dataset.kpiFilter] = item.value;
      });
      setQuery("/kpi", filters);
    });
  });
  document.querySelector("[data-action='reset-kpi']")?.addEventListener("click", () => navigate("/kpi"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
}

function renderEmployees() {
  const query = getQuery();
  const filters = { status: query.status || "", position: query.position || "" };
  const records = employeeService.list(filters);
  const summary = employeeService.summary(records);
  const salesRecords = salesMonitoringService.list({ includeArchived: true });
  const options = {
    statuses: [...new Set(employeeService.list({ includeArchived: true }).map((item) => item.employmentStatus).filter(Boolean))].sort(),
    positions: [...new Set(employeeService.list({ includeArchived: true }).map((item) => item.position).filter(Boolean))].sort()
  };
  const cards = [
    { label: "Total Employees Recorded", value: String(summary.total), context: "Active employee records", iconName: "users" },
    { label: "Active Employees", value: String(summary.active), context: "Employment status is Active", iconName: "check" },
    { label: "Archived Employees", value: String(summary.archived), context: "Hidden from active views", iconName: "archive" },
    { label: "Linked Monitoring Records", value: String(salesRecords.filter((item) => item.assignedEmployeeId).length), context: "Sales/employment records with employee names", iconName: "dashboard" }
  ];
  const columns = [
    { key: "code", label: "Employee Code", sortable: true, render: (row) => escapeHtml(row.employeeCode || "") },
    { key: "name", label: "Name", sortable: true, render: (row) => escapeHtml(getEmployeeFullName(row)) },
    { key: "position", label: "Position", sortable: true, render: (row) => escapeHtml(row.position || "") },
    { key: "status", label: "Employment Status", render: (row) => statusBadge(row.employmentStatus) },
    { key: "contact", label: "Contact Number", render: (row) => escapeHtml(row.contactNumber || "") },
    { key: "email", label: "Email", render: (row) => escapeHtml(row.email || "") },
    { key: "remarks", label: "Remarks", render: (row) => escapeHtml(row.remarks || "") }
  ];
  return `
    ${pageHeader({
      title: "Employee Monitoring",
      eyebrow: "Monitoring and Evaluation",
      description: "Summary of employee records linked from cooperator-generated employment monitoring."
    })}
    <section class="control-panel">
      <label>Employment Status <select data-employee-filter="status"><option value="">All statuses</option>${options.statuses.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.status ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Position <select data-employee-filter="position"><option value="">All positions</option>${options.positions.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.position ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <button class="btn btn-ghost" type="button" data-action="reset-employees">Reset filters</button>
    </section>
    <section class="summary-grid setup-kpis">${cards.map((item) => summaryCard(item)).join("")}</section>
    ${dashboardTableCard({
      title: "Employees by Status",
      rows: summary.byStatus,
      columns: [
        { key: "label", label: "Status", render: (row) => escapeHtml(row.label) },
        { key: "value", label: "Employees", align: "right", render: (row) => formatNumber(row.value) }
      ]
    })}
    <section class="list-toolbar">${searchInput("Search employees")}</section>
    ${dataTable({ columns, rows: records.map((item) => ({ ...item, searchText: `${item.employeeCode} ${getEmployeeFullName(item)} ${item.position} ${item.employmentStatus} ${item.email}` })), emptyMessage: "No employees match the selected filters." })}
  `;
}

function renderEmployeeForm(id = "") {
  const existing = id ? employeeService.get(id) : null;
  const values = existing || { employeeCode: "", firstName: "", lastName: "", address: "", contactNumber: "", email: "", position: "", employmentStatus: "Active", remarks: "" };
  return `
    ${pageHeader({
      title: id ? "Edit Employee" : "Add Employee",
      eyebrow: "Monitoring and Evaluation / Employee Monitoring",
      description: "Employee details can be linked from monthly employment monitoring records.",
      actions: buttonLink("/employees", "Back to Employees", "chevron", "secondary")
    })}
    <form class="record-form" data-employee-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      ${formSection(
        "Employee Details",
        "Use archived status to hide inactive employee records without deleting history.",
        field({ label: "Employee Code", name: "employeeCode", value: values.employeeCode }) +
          field({ label: "First Name", name: "firstName", value: values.firstName, required: true }) +
          field({ label: "Last Name", name: "lastName", value: values.lastName, required: true }) +
          field({ label: "Position", name: "position", value: values.position }) +
          selectField({ label: "Employment Status", name: "employmentStatus", options: lookups.employmentStatuses, value: values.employmentStatus, required: true }) +
          field({ label: "Contact Number", name: "contactNumber", value: values.contactNumber, type: "tel" }) +
          field({ label: "Email", name: "email", value: values.email, type: "email" }) +
          textArea({ label: "Address", name: "address", value: values.address, className: "span-2" }) +
          textArea({ label: "Remarks", name: "remarks", value: values.remarks, className: "span-2" })
      )}
      <div class="sticky-actions"><a class="btn btn-ghost" href="/employees" data-link>Cancel</a><button class="btn btn-primary" type="submit">Save Employee</button></div>
    </form>
  `;
}

function bindEmployees() {
  bindSearch(document);
  bindTableSorts(document);
  document.querySelectorAll("[data-employee-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-employee-filter]").forEach((item) => {
        filters[item.dataset.employeeFilter] = item.value;
      });
      setQuery("/employees", filters);
    });
  });
  document.querySelector("[data-action='reset-employees']")?.addEventListener("click", () => navigate("/employees"));
}

function bindEmployeeForm(id = "") {
  const form = document.querySelector("[data-employee-form]");
  if (!form) return;
  bindDirtyForm(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(form);
    const errors = employeeService.validate(data, id);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) return focusFirstError(form);
    try {
      await employeeService.save(data, id);
      window.__dirtyForm = false;
      createToast(id ? "Employee updated." : "Employee added.");
      navigate("/employees");
    } catch (error) {
      console.error(error);
      createToast("Could not save employee.", "danger");
    }
  });
}

function salesMonitoringOptions() {
  const records = salesMonitoringService.list({ includeArchived: true });
  const firms = [
    ...records
      .reduce((map, item) => {
        if (!item.firmKey) return map;
        if (!map.has(item.firmKey)) map.set(item.firmKey, { key: item.firmKey, name: item.firmName });
        return map;
      }, new Map())
      .values()
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    years: [...new Set([todayIso().slice(0, 4), ...records.map((item) => String(item.assistanceYear)).filter(Boolean)])].sort((a, b) => Number(b) - Number(a)),
    months: Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return { value: `${todayIso().slice(0, 4)}-${month}`, label: new Date(2026, index, 1).toLocaleDateString("en-PH", { month: "short" }).toUpperCase() };
    }),
    staff: [...new Set(records.map((item) => item.assignedStaff).filter(Boolean))].sort(),
    firms,
    sectors: [...new Set(records.map((item) => item.businessSector).filter(Boolean))].sort(),
    municipalities: [...new Set(records.map((item) => item.municipality).filter(Boolean))].sort(),
    projectYears: [...new Set(records.map((item) => String(item.projectYear || "")).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    employmentStatuses: [...new Set(records.map((item) => item.employmentStatus).filter(Boolean))].sort(),
    positions: [...new Set(records.map((item) => item.employeePosition).filter(Boolean))].sort()
  };
}

function salesComparisonChart(rows) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.benchmark, row.actual]));
  return `
    <section class="panel sales-chart-panel">
      <div class="panel-head"><div><h2>Total Monthly Gross Sales vs Actual Gross Sales</h2><p>Benchmark target and actual gross sales totals by reporting month.</p></div></div>
      <div class="sales-chart">
        ${rows
          .map(
            (row) => `
              <div class="sales-chart-month">
                <div class="sales-bars" title="${escapeHtml(row.label)} target ${formatCurrency(row.benchmark)}, actual ${formatCurrency(row.actual)}">
                  <span class="target" style="height:${Math.max(3, percent(row.benchmark, max))}%"></span>
                  <span class="actual" style="height:${Math.max(3, percent(row.actual, max))}%"></span>
                </div>
                <strong>${escapeHtml(row.label)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="chart-legend"><span><i class="legend-target"></i>Benchmark / Target Monthly Gross Sales</span><span><i class="legend-actual"></i>Actual Gross Sales</span></div>
    </section>
  `;
}

function employmentGeneratedChart(rows) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.before, row.after, Math.max(0, row.additional)]));
  return `
    <section class="panel sales-chart-panel">
      <div class="panel-head"><div><h2>Employment Generated</h2><p>Monthly baseline jobs compared with jobs after SETUP monitoring.</p></div></div>
      <div class="sales-chart employment-chart">
        ${rows
          .map(
            (row) => `
              <div class="sales-chart-month">
                <div class="sales-bars" title="${escapeHtml(row.label)} before ${row.before}, after ${row.after}, additional ${row.additional}">
                  <span class="before" style="height:${Math.max(3, percent(row.before, max))}%"></span>
                  <span class="after" style="height:${Math.max(3, percent(row.after, max))}%"></span>
                  <span class="additional" style="height:${Math.max(3, percent(Math.max(0, row.additional), max))}%"></span>
                </div>
                <strong>${escapeHtml(row.label)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="chart-legend"><span><i class="legend-before"></i>Jobs Before</span><span><i class="legend-after"></i>Jobs After</span><span><i class="legend-additional"></i>Additional Jobs</span></div>
    </section>
  `;
}

function salesSectorBreakdown(rows) {
  const sectorRows = salesMonitoringService.sectorRows(rows);
  return dashboardTableCard({
    title: "Benchmark vs Actual by Business Sector",
    description: "Business sector is read from the linked cooperator record when available.",
    rows: sectorRows,
    emptyMessage: "No sales sector data available.",
    columns: [
      { key: "sector", label: "Business Sector", render: (row) => escapeHtml(row.label) },
      { key: "benchmark", label: "Benchmark", align: "right", render: (row) => formatCurrency(row.benchmark) },
      { key: "actual", label: "Actual Gross Sales", align: "right", render: (row) => formatCurrency(row.actual) },
      { key: "performance", label: "Performance", align: "right", render: (row) => `${row.performance.toFixed(1)}%` }
    ]
  });
}

function renderSalesMonitoring() {
  const query = getQuery();
  const filters = {
    assistanceYear: query.assistanceYear || "",
    reportingMonth: query.reportingMonth || "",
    assignedStaff: query.assignedStaff || "",
    firmKey: query.firmKey || "",
    cooperatorId: query.cooperatorId || "",
    businessSector: query.businessSector || "",
    municipality: query.municipality || "",
    projectYear: query.projectYear || "",
    employmentStatus: query.employmentStatus || "",
    position: query.position || ""
  };
  const options = salesMonitoringOptions();
  const records = salesMonitoringService.list(filters);
  const summary = salesMonitoringService.summary(records);
  const employmentSummary = salesMonitoringService.employmentSummary(records);
  const monthlyRows = salesMonitoringService.monthlyRows(records);
  const employmentRows = salesMonitoringService.employmentMonthlyRows(records);
  const cards = [
    { label: "Total Benchmark Monthly Gross Sales", value: formatCurrency(summary.benchmark), context: "Target total for filtered records", iconName: "cash" },
    { label: "Total Actual Gross Sales", value: formatCurrency(summary.actual), context: "Recorded monthly gross sales", iconName: "cash" },
    { label: "Overall Sales Performance", value: `${summary.performance.toFixed(1)}%`, context: "Actual versus benchmark", iconName: "dashboard" },
    { label: "Total Firms Monitored", value: String(summary.firmsMonitored), context: "Unique firms in filtered records", iconName: "users" },
    { label: "Best Performing Month", value: summary.bestMonth, context: "Highest sales performance", iconName: "check" },
    { label: "Lowest Performing Month", value: summary.lowestMonth, context: "Lowest sales performance", iconName: "alert" }
  ];
  const employmentCards = [
    { label: "Total Jobs Before", value: String(employmentSummary.jobsBefore), context: "Baseline jobs from monitoring records", iconName: "users" },
    { label: "Total Jobs After", value: String(employmentSummary.jobsAfter), context: "Current/generated jobs", iconName: "users" },
    { label: "Additional Jobs Generated", value: String(employmentSummary.additionalJobs), context: `${employmentSummary.employmentGrowth.toFixed(1)}% employment growth`, iconName: "check" },
    { label: "Total Monthly Production Cost", value: formatCurrency(employmentSummary.totalMonthlyProductionCost), context: `Avg cost ${employmentSummary.averageProductionCostPercentage.toFixed(1)}% / productivity ${employmentSummary.averageInitialProductivity.toFixed(2)}`, iconName: "cash" }
  ];
  const columns = [
    { key: "assignedStaff", label: "Assigned Staff", sortable: true, render: (row) => escapeHtml(row.assignedStaff) },
    { key: "assistanceYear", label: "Assistance Year", sortable: true, render: (row) => escapeHtml(row.assistanceYear) },
    { key: "firmName", label: "Name of Firm", sortable: true, render: (row) => escapeHtml(row.firmName) },
    { key: "reportingMonth", label: "Reporting Month", sortable: true, render: (row) => escapeHtml(row.monthKey) },
    { key: "benchmark", label: "Benchmark Monthly Gross Sales", render: (row) => formatCurrency(row.benchmarkMonthlyGrossSales) },
    { key: "actual", label: "Gross Sales", render: (row) => formatCurrency(row.grossSales) },
    { key: "variance", label: "Variance", render: (row) => formatCurrency(row.variance) },
    { key: "performance", label: "Performance %", render: (row) => `${row.performance.toFixed(1)}%` },
    { key: "jobsBefore", label: "Jobs Before", render: (row) => escapeHtml(row.jobsGeneratedBefore) },
    { key: "jobsAfter", label: "Jobs After", render: (row) => escapeHtml(row.jobsGeneratedAfter) },
    { key: "additionalJobs", label: "Additional Jobs", render: (row) => escapeHtml(row.additionalJobs) },
    { key: "employee", label: "Added Employee", render: (row) => escapeHtml(row.employeeName) },
    { key: "productionCost", label: "Monthly Production Cost", render: (row) => formatCurrency(row.monthlyTotalProductionCost) },
    { key: "costPercent", label: "Production Cost %", render: (row) => `${Number(row.productionCostPercentage || 0).toFixed(1)}%` },
    { key: "productivity", label: "Initial Productivity", render: (row) => Number(row.initialProductivity || 0).toFixed(2) },
    { key: "remarks", label: "Remarks", render: (row) => escapeHtml(row.remarks || "") },
    { key: "actions", label: "Actions", render: (row) => `<a href="/sales-monitoring/${row.id}/edit" data-link>Edit</a><button type="button" data-action="archive-sales" data-id="${row.id}">Archive</button>` }
  ];
  return `
    ${pageHeader({
      title: "Sales Monitoring",
      eyebrow: "Monitoring and Evaluation",
      description: "Monthly gross sales monitoring for SETUP cooperators and firms.",
      actions: `${buttonLink("/sales-monitoring/new", "Add Sales Record", "plus", "primary")}<button class="btn btn-secondary" type="button" data-action="export-sales">${icon("download")}<span>Export Excel</span></button>`
    })}
    <section class="control-panel sales-filter-panel">
      <label>Assistance Year <select data-sales-filter="assistanceYear"><option value="">All years</option>${options.years.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.assistanceYear ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Assigned Staff <select data-sales-filter="assignedStaff"><option value="">All staff</option>${options.staff.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.assignedStaff ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Firm/Cooperator <select data-sales-filter="firmKey"><option value="">All firms</option>${options.firms.map((item) => `<option value="${escapeHtml(item.key)}" ${item.key === filters.firmKey ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <label>Business Sector <select data-sales-filter="businessSector"><option value="">All sectors</option>${options.sectors.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Municipality <select data-sales-filter="municipality"><option value="">All municipalities</option>${options.municipalities.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Project Year <select data-sales-filter="projectYear"><option value="">All project years</option>${options.projectYears.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.projectYear ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Employment Status <select data-sales-filter="employmentStatus"><option value="">All statuses</option>${options.employmentStatuses.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.employmentStatus ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <label>Position <select data-sales-filter="position"><option value="">All positions</option>${options.positions.map((item) => `<option value="${escapeHtml(item)}" ${item === filters.position ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
      <button class="btn btn-ghost" type="button" data-action="reset-sales">Reset filters</button>
    </section>
    <section class="summary-grid setup-kpis">${cards.map((item) => summaryCard(item)).join("")}</section>
    <section class="summary-grid setup-kpis">${employmentCards.map((item) => summaryCard(item)).join("")}</section>
    ${salesComparisonChart(monthlyRows)}
    ${employmentGeneratedChart(employmentRows)}
    ${salesSectorBreakdown(records)}
    ${dataTable({ columns, rows: records.map((item) => ({ ...item, searchText: `${item.assignedStaff} ${item.firmName} ${item.monthKey} ${item.remarks}` })), emptyMessage: "No sales monitoring records match the selected filters." })}
  `;
}

function renderSalesMonitoringForm(id = "") {
  const query = getQuery();
  const existing = id ? salesMonitoringService.get(id) : null;
  const values = existing || {
    cooperatorId: query.cooperatorId || "",
    assignedStaff: "",
    assistanceYear: new Date().getFullYear(),
    firmName: "",
    reportingMonth: `${todayIso().slice(0, 7)}-01`,
    benchmarkMonthlyGrossSales: "",
    grossSales: "",
    jobsGeneratedBefore: "",
    jobsGeneratedAfter: "",
    assignedEmployeeId: "",
    monthlyTotalProductionCost: "",
    productionCostPercentage: "",
    initialProductivity: "",
    remarks: ""
  };
  const monthValue = String(values.reportingMonth || "").slice(0, 7);
  const cooperatorOptions = beneficiaryService.list().map((item) => ({ id: item.id, name: getCooperatorView(item).firmName })).sort((a, b) => a.name.localeCompare(b.name));
  const employeeOptions = employeeService.list({ includeArchived: true }).map((item) => ({ id: item.id, name: getEmployeeFullName(item) })).sort((a, b) => a.name.localeCompare(b.name));
  return `
    ${pageHeader({
      title: id ? "Edit Sales Record" : "Add Sales Record",
      eyebrow: "Monitoring and Evaluation / Sales Monitoring",
      description: "Record one monthly gross sales entry per firm.",
      actions: buttonLink("/sales-monitoring", "Back to Sales Monitoring", "chevron", "secondary")
    })}
    <form class="record-form" data-sales-form data-record-id="${escapeHtml(id)}" novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      <section class="form-section">
        <div class="form-section-heading"><h2>Sales Record</h2><p>Benchmark is the target monthly gross sales; gross sales is the actual recorded amount.</p></div>
        <div class="form-grid">
          <label class="field"><span>Cooperator/Firm</span><select name="cooperatorId" data-sales-cooperator><option value="">Manual firm name</option>${cooperatorOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === values.cooperatorId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><em class="field-error" data-error-for="cooperatorId"></em></label>
          ${field({ label: "Name of Firm", name: "firmName", value: values.firmName, required: true })}
          ${field({ label: "Assigned Staff", name: "assignedStaff", value: values.assignedStaff, required: true })}
          ${field({ label: "Assistance Year", name: "assistanceYear", value: values.assistanceYear, type: "number", min: "1900", required: true })}
          ${field({ label: "Reporting Month", name: "reportingMonth", value: monthValue, type: "month", required: true })}
          ${field({ label: "Benchmark Monthly Gross Sales (PHP / ₱)", name: "benchmarkMonthlyGrossSales", value: values.benchmarkMonthlyGrossSales, type: "number", min: "0", step: "0.01", required: true })}
          ${field({ label: "Actual Gross Sales (PHP / ₱)", name: "grossSales", value: values.grossSales, type: "number", min: "0", step: "0.01", required: true })}
          ${field({ label: "Jobs Before", name: "jobsGeneratedBefore", value: values.jobsGeneratedBefore, type: "number", min: "0", step: "1" })}
          ${field({ label: "Jobs After", name: "jobsGeneratedAfter", value: values.jobsGeneratedAfter, type: "number", min: "0", step: "1" })}
          <label class="field"><span>Added Employee</span><select name="assignedEmployeeId"><option value="">Select employee</option>${employeeOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === values.assignedEmployeeId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><em class="field-error" data-error-for="assignedEmployeeId"></em></label>
          ${field({ label: "Monthly Total Production Cost (PHP / ₱)", name: "monthlyTotalProductionCost", value: values.monthlyTotalProductionCost, type: "number", min: "0", step: "0.01" })}
          ${field({ label: "Production Cost Percentage", name: "productionCostPercentage", value: values.productionCostPercentage, type: "number", min: "0", step: "0.01" })}
          ${field({ label: "Initial Productivity", name: "initialProductivity", value: values.initialProductivity, type: "number", min: "0", step: "0.01" })}
          ${textArea({ label: "Remarks", name: "remarks", value: values.remarks, className: "span-2" })}
        </div>
      </section>
      <div class="sticky-actions">
        <a class="btn btn-ghost" href="/sales-monitoring" data-link>Cancel</a>
        <button class="btn btn-primary" type="submit">Save Sales Record</button>
      </div>
    </form>
  `;
}

function bindSalesMonitoring() {
  bindSearch(document);
  bindTableSorts(document);
  document.querySelectorAll("[data-sales-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-sales-filter]").forEach((item) => {
        filters[item.dataset.salesFilter] = item.value;
      });
      setQuery("/sales-monitoring", filters);
    });
  });
  document.querySelector("[data-action='reset-sales']")?.addEventListener("click", () => navigate("/sales-monitoring"));
  document.querySelector("[data-action='export-sales']")?.addEventListener("click", () => {
    const rows = salesMonitoringService.list(getQuery()).map((row) => ({
      "Assigned Staff": row.assignedStaff,
      "Assistance Year": row.assistanceYear,
      "Name of Firm": row.firmName,
      "Reporting Month": row.monthKey,
      "Benchmark Monthly Gross Sales": row.benchmarkMonthlyGrossSales,
      "Gross Sales": row.grossSales,
      Variance: row.variance,
      "Performance %": `${row.performance.toFixed(1)}%`,
      "Jobs Before": row.jobsGeneratedBefore,
      "Jobs After": row.jobsGeneratedAfter,
      "Additional Jobs": row.additionalJobs,
      "Added Employee": row.employeeName,
      Position: row.employeePosition,
      "Employment Status": row.employmentStatus,
      "Monthly Total Production Cost": row.monthlyTotalProductionCost,
      "Production Cost %": row.productionCostPercentage,
      "Initial Productivity": row.initialProductivity,
      "Business Sector": row.businessSector,
      Remarks: row.remarks
    }));
    downloadXlsx(`sales-monitoring-${todayIso()}.xlsx`, "Sales Monitoring", rows);
    createToast("Sales monitoring records exported to Excel.");
  });
  document.querySelectorAll("[data-action='archive-sales']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction("Archive this sales monitoring record?", {
        title: "Archive record?",
        confirmLabel: "Archive"
      });
      if (!confirmed) return;
      salesMonitoringService.archive(button.dataset.id);
      createToast("Sales monitoring record archived.");
      renderApp();
    });
  });
}

function bindSalesMonitoringForm(id = "") {
  const form = document.querySelector("[data-sales-form]");
  if (!form) return;
  bindDirtyForm(form);
  const firmInput = form.elements.firmName;
  const cooperatorSelect = form.elements.cooperatorId;
  const autofillFirm = () => {
    const beneficiary = beneficiaryService.get(cooperatorSelect.value);
    if (beneficiary) firmInput.value = getCooperatorView(beneficiary).firmName;
  };
  cooperatorSelect.addEventListener("change", autofillFirm);
  autofillFirm();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(form);
    const errors = salesMonitoringService.validate(data, id);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    try {
      await salesMonitoringService.save(data, id);
      window.__dirtyForm = false;
      createToast(id ? "Sales monitoring record updated." : "Sales monitoring record added.");
      navigate("/sales-monitoring");
    } catch (error) {
      console.error(error);
      createToast("Could not save sales monitoring record.", "danger");
    }
  });
}

function renderBeneficiaries() {
  const filters = getQuery();
  const cooperatorFilterKeys = [
    "year",
    "municipality",
    "district",
    "businessType",
    "businessSector",
    "enterpriseClassification",
    "service",
    "setupStatus",
    "officer",
    "delinquency"
  ];
  const visibleFilters = Object.fromEntries(cooperatorFilterKeys.map((key) => [key, filters[key]]).filter(([, value]) => value));
  let records = beneficiaryService.list().map((item) => {
    const cooperator = getCooperatorView(item, item.financials);
    return {
      ...item,
      cooperatorView: cooperator,
      setupStatus: cooperator.setup.calculatedStatus,
      delayedState: item.financials.pastDue > 0 ? "Overdue" : "Current"
    };
  });
  if (filters.year) records = records.filter((item) => String(item.cooperatorView.setup.yearAwarded) === String(filters.year) || item.cooperatorView.setup.phases.some((phase) => String(phase.yearAwarded) === String(filters.year)));
  if (filters.municipality) records = records.filter((item) => item.cooperatorView.municipality === filters.municipality);
  if (filters.district) records = records.filter((item) => item.cooperatorView.district === filters.district);
  if (filters.businessType) records = records.filter((item) => item.cooperatorView.businessType === filters.businessType);
  if (filters.businessSector) records = records.filter((item) => item.cooperatorView.businessSector === filters.businessSector);
  if (filters.enterpriseClassification) records = records.filter((item) => item.cooperatorView.enterpriseClassification === filters.enterpriseClassification);
  if (filters.service) records = records.filter((item) => item.cooperatorView.services.some((service) => service.category === filters.service));
  if (filters.setupStatus) records = records.filter((item) => item.setupStatus === filters.setupStatus || item.cooperatorView.setup.phases.some((phase) => phase.status === filters.setupStatus));
  if (filters.officer) records = records.filter((item) => item.cooperatorView.setup.assignedProjectOfficer === filters.officer || item.cooperatorView.setup.phases.some((phase) => phase.officer === filters.officer));
  if (filters.delinquency) records = records.filter((item) => item.delayedState === filters.delinquency);
  const officerOptions = [
    ...new Set(
      beneficiaryService
        .list()
        .flatMap((item) => {
          const cooperator = getCooperatorView(item);
          return [cooperator.setup.assignedProjectOfficer, ...cooperator.setup.phases.map((phase) => phase.officer)].filter(Boolean);
        })
    )
  ].sort();
  const rows = records.map((item) => ({
    ...item,
    searchText: [
      item.cooperatorView.firmName,
      item.cooperatorView.cooperatorName,
      item.cooperatorView.municipality,
      item.cooperatorView.district,
      item.cooperatorView.businessType,
      item.cooperatorView.businessSector,
      item.cooperatorView.setup.projectTitle,
      item.cooperatorView.setup.assignedProjectOfficer,
      ...item.cooperatorView.setup.phases.flatMap((phase) => [phase.phase, phase.status, phase.projectTitle, phase.officer]),
      item.setupStatus,
      item.delayedState
    ].join(" ")
  }));
  const columns = [
    { key: "firm", label: "Name of Firm", sortable: true, render: (row) => `<a href="/beneficiaries/${row.id}" data-link>${escapeHtml(row.cooperatorView.firmName)}</a>` },
    { key: "cooperator", label: "Name of Cooperator", sortable: true, render: (row) => escapeHtml(row.cooperatorView.cooperatorName) },
    { key: "municipality", label: "Municipality", sortable: true, render: (row) => escapeHtml(row.cooperatorView.municipality || "Not provided") },
    { key: "district", label: "District", sortable: true, render: (row) => escapeHtml(row.cooperatorView.district || "Not classified") },
    { key: "businessType", label: "Type of Business", sortable: true, render: (row) => escapeHtml(row.cooperatorView.businessType || "Not provided") },
    { key: "businessSector", label: "Business Sector", sortable: true, render: (row) => escapeHtml(row.cooperatorView.businessSector || "Not classified") },
    { key: "enterprise", label: "Enterprise Classification", sortable: true, render: (row) => escapeHtml(row.cooperatorView.enterpriseClassification) },
    { key: "setupStatus", label: "SETUP Project Status", sortable: true, render: (row) => statusBadge(row.setupStatus) },
    { key: "setupPhases", label: "SETUP Phases", sortable: true, render: (row) => setupPhaseSummary(row.cooperatorView.setup.phases) },
    {
      key: "actions",
      label: "Actions",
      render: (row) => `<div class="row-actions"><a href="/beneficiaries/${row.id}" data-link>View</a><a href="/beneficiaries/${row.id}/edit" data-link>Edit</a><button type="button" data-action="archive-beneficiary" data-id="${row.id}">Archive</button><button type="button" data-action="delete-record" data-type="beneficiaries" data-id="${row.id}">Delete</button></div>`
    }
  ];
  return `
    ${pageHeader({
      title: "Cooperators",
      eyebrow: "SETUP",
      description: "Maintain firm, cooperator, business, services, SETUP project, and refund information.",
      actions: `${buttonLink("/beneficiaries/new", "Add Cooperator", "plus", "primary")}<button class="btn btn-secondary" type="button" data-action="export-beneficiaries">${icon("download")}<span>Export View</span></button><button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")}<span>Print View</span></button>`
    })}
    <section class="list-toolbar">
      ${searchInput("Search firm, cooperator, municipality, district, business, project, or officer")}
      <details class="filter-details">
        <summary>${icon("filter")} Filters</summary>
        <div class="filter-grid">
          <label>Year Awarded <select data-list-filter="year"><option value="">All</option>${yearOptions(filters.year)}</select></label>
          <label>Municipality <select data-list-filter="municipality"><option value="">All</option>${lookups.municipalities.map((item) => `<option ${item === filters.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>District <select data-list-filter="district"><option value="">All</option>${lookups.districts.map((item) => `<option ${item === filters.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>Type of Business <select data-list-filter="businessType"><option value="">All</option>${lookups.businessTypes.map((item) => `<option ${item === filters.businessType ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>Business Sector <select data-list-filter="businessSector"><option value="">All</option>${lookups.businessSectors.map((item) => `<option ${item === filters.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>Enterprise Classification <select data-list-filter="enterpriseClassification"><option value="">All</option>${["Micro Enterprise", "Small Enterprise", "Medium Enterprise", "Not yet classified"].map((item) => `<option ${item === filters.enterpriseClassification ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>Service Availed <select data-list-filter="service"><option value="">All</option>${lookups.serviceCategories.map((item) => `<option ${item === filters.service ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>SETUP Project Status <select data-list-filter="setupStatus"><option value="">All</option>${setupStatusOptions(filters.setupStatus, { includeArchived: true })}</select></label>
          <label>Assigned Project Officer <select data-list-filter="officer"><option value="">All</option>${officerOptions.map((item) => `<option ${item === filters.officer ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label>Delinquency State <select data-list-filter="delinquency"><option value="">All</option>${["Current", "Overdue"].map((item) => `<option ${item === filters.delinquency ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <button class="btn btn-ghost" type="button" data-action="reset-beneficiary-filters">Reset filters</button>
        </div>
      </details>
      <details class="column-details">
        <summary>Columns</summary>
        <div class="column-toggles">${columns
          .filter((column) => column.key !== "firm" && column.key !== "actions")
          .map((column) => `<label><input type="checkbox" checked data-column-toggle="${column.key}" /> ${escapeHtml(column.label)}</label>`)
          .join("")}</div>
      </details>
      ${filterChips(visibleFilters)}
      <p class="result-count"><strong data-visible-count>${records.length}</strong> records shown</p>
    </section>
    ${dataTable({ columns, rows, emptyMessage: "No cooperators match the selected filters.", className: "beneficiary-table cooperator-table" })}
    <section class="mobile-record-list">
      ${
        rows.length
          ? rows
              .map((row) =>
                mobileRecordCard({
                  title: row.cooperatorView.firmName,
                  subtitle: `${row.cooperatorView.cooperatorName} / ${row.cooperatorView.municipality || "Not provided"}`,
                  status: row.setupStatus,
                  searchText: row.searchText,
                  meta: [
                    { label: "Location", value: escapeHtml(`${row.cooperatorView.municipality || "Not provided"} / ${row.cooperatorView.district || "Not classified"}`) },
                    { label: "Classification", value: escapeHtml(row.cooperatorView.enterpriseClassification) },
                    { label: "SETUP Phases", value: setupPhasePlainSummary(row.cooperatorView.setup.phases) },
                    { label: "Delinquency", value: escapeHtml(row.delayedState) }
                  ],
                  actions: `<a class="btn btn-secondary" href="/beneficiaries/${row.id}" data-link>View Account</a><button class="btn btn-ghost" type="button" data-action="archive-beneficiary" data-id="${row.id}">Archive</button><button class="btn btn-ghost" type="button" data-action="delete-record" data-type="beneficiaries" data-id="${row.id}">Delete</button>`
                })
              )
              .join("")
          : ""
      }
    </section>
  `;
}

function bindBeneficiaries() {
  bindSearch(document);
  bindTableSorts(document);
  document.querySelectorAll("[data-list-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-list-filter]").forEach((item) => {
        filters[item.dataset.listFilter] = item.value;
      });
      setQuery("/beneficiaries", filters);
    });
  });
  document.querySelector("[data-action='reset-beneficiary-filters']")?.addEventListener("click", () => navigate("/beneficiaries"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
  document.querySelector("[data-action='export-beneficiaries']")?.addEventListener("click", () => {
    const rows = beneficiaryService.list().map((item) => [
      getCooperatorView(item).firmName,
      getCooperatorView(item).cooperatorName,
      getCooperatorView(item).municipality,
      getCooperatorView(item).district,
      getCooperatorView(item).businessType,
      getCooperatorView(item).businessSector,
      getCooperatorView(item).enterpriseClassification,
      getCooperatorView(item).setup.calculatedStatus,
      getCooperatorView(item).setup.phases.map((phase) => `${phase.phase}: ${phase.status || "Pending"}`).join("; "),
      item.financials.totalPaid
    ]);
    downloadCsv("cooperators-filtered-view.csv", [["Name of Firm", "Name of Cooperator", "Municipality", "District", "Type of Business", "Business Sector", "Enterprise Classification", "SETUP Project Status", "SETUP Phases", "Paid"], ...rows]);
  });
  document.querySelectorAll("[data-action='archive-beneficiary']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction("Archive this cooperator record? It can be restored later.", {
        title: "Archive cooperator?",
        confirmLabel: "Archive"
      });
      if (!confirmed) return;
      beneficiaryService.archive(button.dataset.id);
      createToast("Cooperator archived.");
      renderApp();
    });
  });
  bindDeleteActions();
  document.querySelectorAll("[data-column-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(`[data-col="${input.dataset.columnToggle}"]`).forEach((cell) => {
        cell.hidden = !input.checked;
      });
    });
  });
}

function beneficiaryFormValues(record) {
  const cooperator = record ? getCooperatorView(record) : null;
  if (!record || !cooperator) {
    return {
      services: [{ category: "", subtype: "", dateAvailed: "", remarks: "" }],
      setupProjects: [],
      isPwd: "",
      isIndigenousPeople: "",
      projectStatus: "Ongoing"
    };
  }
  const phaseLabels = setupPhaseOptions();
  const setupServices = cooperator.services.filter((service) => service.category === "SETUP");
  const setupProjects = setupServices.length
    ? setupServices.map((service, index) => {
        const phase = parseSetupPhaseRemarks(service.remarks);
        const legacyArchived = phase.status === "Archived";
        const phaseStatus = phase.status && phase.status !== "Archived" ? phase.status : index === 0 ? cooperator.setup.manualStatus || cooperator.setup.calculatedStatus || "Ongoing" : "Pending";
        return {
          id: service.id || "",
          subtype: service.subtype || phaseLabels[index] || "Phase I",
          status: phaseStatus,
          projectTitle: phase.projectTitle || (index === 0 ? cooperator.setup.projectTitle : ""),
          yearAwarded: phase.yearAwarded || (index === 0 ? cooperator.setup.yearAwarded : ""),
          officer: phase.officer || (index === 0 ? cooperator.setup.assignedProjectOfficer : ""),
          fundAssistance: phase.fundAssistance || (index === 0 ? cooperator.setup.financial.fundAssistance : ""),
          releaseDate: phase.releaseDate || service.dateAvailed || (index === 0 ? record.financial.releaseDate : ""),
          monthlyRefund: phase.monthlyRefund || (index === 0 ? cooperator.setup.financial.monthlyRefund : ""),
          refundStart: phase.refundStart || (index === 0 ? cooperator.setup.financial.refundStart : ""),
          refundEnd: phase.refundEnd || (index === 0 ? cooperator.setup.financial.refundEnd : ""),
          numberOfMonths: phase.numberOfMonths || (index === 0 ? cooperator.setup.financial.numberOfMonths : ""),
          technologyTransferFee: phase.technologyTransferFee || (index === 0 ? record.financial.technologyTransferFee : ""),
          optionToBuyAmount: phase.optionToBuyAmount || (index === 0 ? record.financial.optionToBuyAmount : ""),
          otherFees: phase.otherFees || (index === 0 ? record.financial.otherFees : ""),
          financialRemarks: phase.financialRemarks || (index === 0 ? record.financial.remarks : ""),
          archived: phase.archived || legacyArchived || false,
          archivedAt: phase.archivedAt || "",
          notes: phase.notes || ""
        };
      })
    : [];
  const services = [
    ...cooperator.services.filter((service) => service.category !== "SETUP"),
    ...(setupServices.length ? [{ category: "SETUP", subtype: "", dateAvailed: "", remarks: "" }] : [])
  ];
  return {
    firmName: cooperator.firmName,
    cooperatorName: cooperator.cooperatorName,
    sex: cooperator.sex,
    birthDate: cooperator.birthDate,
    isPwd: cooperator.pwd,
    isIndigenousPeople: cooperator.indigenousPeople,
    completeAddress: cooperator.completeAddress,
    municipality: cooperator.municipality,
    district: cooperator.district,
    contactNumber: cooperator.contactNumber,
    email: cooperator.email,
    notes: record.notes,
    businessType: cooperator.businessType,
    businessSector: cooperator.businessSector,
    assetLand: cooperator.assets.land || "",
    assetBuilding: cooperator.assets.building || "",
    assetEquipment: cooperator.assets.equipment || "",
    assetRevolvingCapital: cooperator.assets.revolvingCapital || "",
    services,
    setupProjects,
    projectTitle: cooperator.setup.projectTitle,
    yearAwarded: cooperator.setup.yearAwarded,
    officer: cooperator.setup.assignedProjectOfficer,
    projectStatus: cooperator.setup.manualStatus || cooperator.setup.calculatedStatus || "Ongoing",
    fundAssistance: cooperator.setup.financial.fundAssistance || "",
    releaseDate: record.financial.releaseDate,
    refundStart: cooperator.setup.financial.refundStart,
    refundEnd: cooperator.setup.financial.refundEnd,
    numberOfMonths: cooperator.setup.financial.numberOfMonths,
    monthlyRefund: cooperator.setup.financial.monthlyRefund || "",
    technologyTransferFee: record.financial.technologyTransferFee,
    optionToBuyAmount: record.financial.optionToBuyAmount,
    otherFees: record.financial.otherFees,
    initialRemarks: record.financial.remarks,
    status: record.status,
    spin: cooperator.legacy.spin,
      sourceOfFund: cooperator.legacy.sourceOfFund
  };
}

function radioGroup({ legend, name, options, value = "", required = false }) {
  return `
    <fieldset class="segmented-field">
      <legend>${escapeHtml(legend)}${required ? '<b aria-label="required">*</b>' : ""}</legend>
      <div>
        ${options.map((option) => `<label><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(option)}" ${option === value ? "checked" : ""} ${required ? "required" : ""} /><span>${escapeHtml(option)}</span></label>`).join("")}
      </div>
      <em class="field-error" data-error-for="${escapeHtml(name)}"></em>
    </fieldset>
  `;
}

function serviceCard(service = {}, index = 0) {
  const isSetup = service.category === "SETUP";
  const subtypeOptions = isSetup ? [] : lookups.serviceSubtypes[service.category] || [];
  return `
    <article class="service-card" data-service-card data-service-id="${escapeHtml(service.id || "")}">
      <div class="service-card-head">
        <strong>Service ${index + 1}</strong>
        <button class="btn btn-ghost" type="button" data-action="remove-service">Remove Service</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>Service category</span><select data-service-category><option value="">Select</option>${lookups.serviceCategories.map((item) => `<option value="${escapeHtml(item)}" ${item === service.category ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <div class="${isSetup ? "calculation-callout" : "is-hidden"}" data-setup-service-note>SETUP project details are encoded below in Additional SETUP Information.</div>
        <div class="${isSetup ? "is-hidden" : "form-grid span-2"}" data-service-detail-fields>
          <label class="field ${subtypeOptions.length ? "" : "is-hidden"}" data-subtype-field><span>Subtype</span><select data-service-subtype><option value="">Select subtype</option>${subtypeOptions.map((item) => `<option value="${escapeHtml(item)}" ${item === service.subtype ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label class="field"><span>Date Availed</span><input type="date" data-service-date value="${escapeHtml(service.dateAvailed || "")}" /></label>
          <label class="field span-2" data-service-remarks-field><span>Remarks</span><textarea data-service-remarks>${escapeHtml(service.remarks || "")}</textarea></label>
        </div>
      </div>
    </article>
  `;
}

function servicesMarkup(services = []) {
  return services.map((service, index) => serviceCard(service, index)).join("");
}

function setupProjectCard(project = {}, index = 0) {
  const phase = setupPhaseOptions()[index] || `Phase ${index + 1}`;
  const refundStart = project.refundStart || "";
  const refundEnd = project.refundEnd || "";
  const numberOfMonths = project.numberOfMonths || getRefundMonthCount(refundStart, refundEnd) || "";
  const scheduledTotal = toNumber(project.monthlyRefund) * Number(numberOfMonths || 0);
  const totalFund = toNumber(project.fundAssistance) + toNumber(project.technologyTransferFee) + toNumber(project.optionToBuyAmount) + toNumber(project.otherFees);
  return `
    <article class="service-card setup-project-card" data-setup-project-card data-service-id="${escapeHtml(project.id || "")}">
      <input type="hidden" data-setup-phase-archived value="${project.archived ? "true" : "false"}" />
      <input type="hidden" data-setup-phase-archived-at value="${escapeHtml(project.archivedAt || "")}" />
      <div class="service-card-head">
        <strong data-setup-phase-label>${escapeHtml(phase)}</strong>
        <button class="btn btn-ghost" type="button" data-action="remove-setup-project">Remove Project</button>
      </div>
      <div class="setup-phase-fields">
        <label class="field"><span>Project Status</span><select data-setup-phase-status><option value="">Select status</option>${setupStatusOptions(project.status || (index === 0 ? "Ongoing" : "Pending"))}</select></label>
        <label class="field"><span>Project / Setup Details</span><input data-setup-phase-title value="${escapeHtml(project.projectTitle || "")}" placeholder="Specific phase project title" /></label>
        <label class="field"><span>Year Awarded</span><input type="number" min="1900" data-setup-phase-year value="${escapeHtml(project.yearAwarded || new Date().getFullYear())}" /></label>
        <label class="field"><span>Assigned Officer</span><input data-setup-phase-officer value="${escapeHtml(project.officer || "")}" /></label>
        <label class="field"><span>Release Date</span><input type="date" data-setup-phase-release value="${escapeHtml(project.releaseDate || "")}" /><em class="field-error" data-setup-release-error></em></label>
        <label class="field"><span>SETUP Fund / Amount</span><input type="number" min="0" step="0.01" data-setup-phase-fund value="${escapeHtml(project.fundAssistance || "")}" /></label>
        <label class="field"><span>Monthly Refund Based on MOA</span><input type="number" min="0" step="0.01" data-setup-phase-monthly value="${escapeHtml(project.monthlyRefund || "")}" /></label>
        <label class="field"><span>Monthly Refund Start</span><input type="date" data-setup-phase-refund-start value="${escapeHtml(refundStart)}" /><em class="field-error" data-setup-refund-start-error></em></label>
        <label class="field"><span>Monthly Refund End</span><input type="date" data-setup-phase-refund-end value="${escapeHtml(refundEnd)}" /><em class="field-error" data-setup-refund-end-error></em></label>
        <label class="field"><span>Number of Months of Refund</span><input readonly data-setup-phase-months value="${escapeHtml(numberOfMonths)}" /><small>Calculated from start and end dates.</small></label>
        <label class="field"><span>Technology Transfer Fee</span><input type="number" min="0" step="0.01" data-setup-phase-ttf value="${escapeHtml(project.technologyTransferFee || "")}" /></label>
        <label class="field"><span>Option to Buy Amount</span><input type="number" min="0" step="0.01" data-setup-phase-option value="${escapeHtml(project.optionToBuyAmount || "")}" /></label>
        <label class="field"><span>Other Fees</span><input type="number" min="0" step="0.01" data-setup-phase-other-fees value="${escapeHtml(project.otherFees || "")}" /></label>
        <label class="field"><span>Financial Remarks</span><textarea data-setup-phase-financial-remarks>${escapeHtml(project.financialRemarks || "")}</textarea></label>
        <div class="financial-preview span-2" data-setup-phase-preview>
          <strong>This phase has its own refund schedule</strong>
          <span>Total Fund / Repayable: ${formatCurrency(totalFund)}</span>
          <span>Expected Monthly Refund: ${formatCurrency(project.monthlyRefund)}</span>
          <span>Number of Refund Months: ${escapeHtml(numberOfMonths || "0")}</span>
          <span>Estimated Total Scheduled Refund: ${formatCurrency(scheduledTotal)}</span>
          <span>Difference / final installment remainder: ${formatCurrency(totalFund - scheduledTotal)}</span>
        </div>
        <label class="field span-2"><span>Project Remarks</span><textarea data-setup-phase-notes>${escapeHtml(project.notes || "")}</textarea></label>
      </div>
    </article>
  `;
}

function setupProjectsMarkup(projects = []) {
  const records = projects.length ? projects : [{ status: "Ongoing" }];
  return records.map((project, index) => setupProjectCard(project, index)).join("");
}

function readBeneficiaryForm(form) {
  const data = readForm(form);
  const nonSetupServices = [...form.querySelectorAll("[data-service-card]")].map((card) => {
    const category = card.querySelector("[data-service-category]")?.value || "";
    return {
      id: card.dataset.serviceId || "",
      category,
      subtype: card.querySelector("[data-service-subtype]")?.value || "",
      dateAvailed: card.querySelector("[data-service-date]")?.value || "",
      remarks: card.querySelector("[data-service-remarks]")?.value.trim() || ""
    };
  }).filter((service) => service.category && service.category !== "SETUP");
  const hasSetup = Boolean(form.querySelector("[data-setup-project-card]"));
  const setupProjects = hasSetup
      ? [...form.querySelectorAll("[data-setup-project-card]")].map((card, index) => {
        const releaseDate = card.querySelector("[data-setup-phase-release]")?.value || "";
        const refundStart = card.querySelector("[data-setup-phase-refund-start]")?.value || "";
        const refundEnd = card.querySelector("[data-setup-phase-refund-end]")?.value || "";
        const phase = setupPhaseOptions()[index] || `Phase ${index + 1}`;
        const project = {
          status: card.querySelector("[data-setup-phase-status]")?.value || "",
          projectTitle: card.querySelector("[data-setup-phase-title]")?.value.trim() || "",
          yearAwarded: card.querySelector("[data-setup-phase-year]")?.value || "",
          officer: card.querySelector("[data-setup-phase-officer]")?.value.trim() || "",
          fundAssistance: card.querySelector("[data-setup-phase-fund]")?.value || "",
          releaseDate,
          monthlyRefund: card.querySelector("[data-setup-phase-monthly]")?.value || "",
          refundStart,
          refundEnd,
          numberOfMonths: card.querySelector("[data-setup-phase-months]")?.value || getRefundMonthCount(refundStart, refundEnd) || "",
          technologyTransferFee: card.querySelector("[data-setup-phase-ttf]")?.value || "",
          optionToBuyAmount: card.querySelector("[data-setup-phase-option]")?.value || "",
          otherFees: card.querySelector("[data-setup-phase-other-fees]")?.value || "",
          financialRemarks: card.querySelector("[data-setup-phase-financial-remarks]")?.value.trim() || "",
          archived: card.querySelector("[data-setup-phase-archived]")?.value === "true",
          archivedAt: card.querySelector("[data-setup-phase-archived-at]")?.value || "",
          notes: card.querySelector("[data-setup-phase-notes]")?.value.trim() || ""
        };
        return {
          id: card.dataset.serviceId || "",
          category: "SETUP",
          subtype: phase,
          dateAvailed: releaseDate,
          remarks: formatSetupPhaseRemarks(project)
        };
      })
    : [];
  if (hasSetup && !setupProjects.length) {
    setupProjects.push({
      category: "SETUP",
      subtype: "Phase I",
      dateAvailed: data.releaseDate || "",
      remarks: formatSetupPhaseRemarks({
        status: data.projectStatus || "Ongoing",
        projectTitle: data.projectTitle || "",
        yearAwarded: data.yearAwarded || "",
        officer: data.officer || "",
        fundAssistance: data.fundAssistance || "",
        releaseDate: data.releaseDate || "",
        notes: ""
      })
    });
  }
  data.services = [...nonSetupServices, ...setupProjects];
  data.inlineEmployees = [...form.querySelectorAll("[data-inline-employee-card]")].map((card) => {
    const employee = {};
    card.querySelectorAll("[data-inline-employee-field]").forEach((control) => {
      employee[control.dataset.inlineEmployeeField] = control.value;
    });
    return employee;
  });
  const firstProject = setupProjects[0] ? parseSetupPhaseRemarks(setupProjects[0].remarks) : null;
  if (firstProject) {
    data.projectTitle = data.projectTitle || firstProject.projectTitle || "";
    data.yearAwarded = data.yearAwarded || firstProject.yearAwarded || "";
    data.officer = data.officer || firstProject.officer || "";
    data.projectStatus = data.projectStatus || firstProject.status || "";
    data.fundAssistance = data.fundAssistance || firstProject.fundAssistance || "";
    data.releaseDate = data.releaseDate || firstProject.releaseDate || setupProjects[0].dateAvailed || "";
    data.monthlyRefund = data.monthlyRefund || firstProject.monthlyRefund || "";
    data.refundStart = data.refundStart || firstProject.refundStart || "";
    data.refundEnd = data.refundEnd || firstProject.refundEnd || "";
    data.numberOfMonths = data.numberOfMonths || firstProject.numberOfMonths || getRefundMonthCount(data.refundStart, data.refundEnd) || "";
    data.technologyTransferFee = data.technologyTransferFee || firstProject.technologyTransferFee || "";
    data.optionToBuyAmount = data.optionToBuyAmount || firstProject.optionToBuyAmount || "";
    data.otherFees = data.otherFees || firstProject.otherFees || "";
    data.initialRemarks = data.initialRemarks || firstProject.financialRemarks || "";
  }
  const legacyMonthsInput = form.querySelector("[name='numberOfMonths']");
  if (legacyMonthsInput) data.numberOfMonths = legacyMonthsInput.value || "";
  return data;
}

function setupSection(values) {
  return `
    <section class="form-section setup-section" data-setup-section>
      <div class="form-section-heading">
        <h2>Additional SETUP Information</h2>
        <p>Add SETUP project phases here. Phase labels are assigned automatically by the system.</p>
      </div>
      <div class="form-grid">
        ${field({ label: "Project Title", name: "projectTitle", value: values.projectTitle })}
        ${field({ label: "Year of Award", name: "yearAwarded", value: values.yearAwarded || new Date().getFullYear(), type: "number", min: "1900" })}
        ${field({ label: "Assigned Project Officer", name: "officer", value: values.officer })}
        <label class="field"><span>Project Status</span><select name="projectStatus"><option value="">Select</option>${setupStatusOptions(values.projectStatus || "Ongoing")}</select><em class="field-error" data-error-for="projectStatus"></em></label>
        <div class="calculation-callout span-2" data-status-source>Current status source: ${escapeHtml(values.projectStatus === "Terminated" ? "Manually assigned" : "Automatically calculated")}</div>
        <section class="subform span-2 setup-project-editor">
          <div class="panel-head">
            <div>
              <h3>SETUP Projects / Phases</h3>
              <p>Project phases are labeled automatically by the system.</p>
            </div>
            <button class="btn btn-secondary" type="button" data-action="add-setup-project">${icon("plus")} Add Project</button>
          </div>
          <div class="service-editor" data-setup-projects-list>${setupProjectsMarkup(values.setupProjects || [])}</div>
        </section>
      </div>
    </section>
  `;
}

function currentReportingMonth() {
  return todayIso().slice(0, 7);
}

function hasInlineEmployeeData(employee = {}) {
  return [
    "firstName",
    "lastName",
    "employeePosition",
    "employeeContactNumber",
    "employeeEmail",
    "employeeAddress",
    "employeeRemarks"
  ].some((key) => String(employee[key] || "").trim());
}

function hasInlineEmploymentMonitoringData(employee = {}) {
  return (
    hasInlineEmployeeData(employee) ||
    ["jobsGeneratedBefore", "jobsGeneratedAfter", "monthlyTotalProductionCost", "productionCostPercentage", "initialProductivity"].some((key) => toNumber(employee[key]) > 0)
  );
}

function inlineEmployeeData(employee = {}) {
  return {
    employeeCode: employee.employeeCode || "",
    firstName: employee.firstName || "",
    lastName: employee.lastName || "",
    position: employee.employeePosition || "",
    employmentStatus: employee.employeeEmploymentStatus || "Active",
    contactNumber: employee.employeeContactNumber || "",
    email: employee.employeeEmail || "",
    address: employee.employeeAddress || "",
    remarks: employee.employeeRemarks || ""
  };
}

function validateInlineEmployment(data = {}) {
  const errors = {};
  (data.inlineEmployees || []).forEach((employee, index) => {
    if (!hasInlineEmploymentMonitoringData(employee)) return;
    const employeeRecord = inlineEmployeeData(employee);
    const employeeErrors = {};
    if (employeeRecord.email && !validateEmail(employeeRecord.email)) employeeErrors.email = "Enter a valid email address.";
    if (employeeRecord.contactNumber && !validatePhone(employeeRecord.contactNumber)) employeeErrors.contactNumber = "Enter a valid contact number.";
    if (employeeRecord.employeeCode?.trim()) {
      const duplicate = employeeService.list({ includeArchived: true }).find((item) => item.employeeCode === employeeRecord.employeeCode.trim());
      if (duplicate) employeeErrors.employeeCode = "This employee code already exists.";
    }
    const fieldMap = {
      employeeCode: `inlineEmployees.${index}.employeeCode`,
      firstName: `inlineEmployees.${index}.firstName`,
      lastName: `inlineEmployees.${index}.lastName`,
      contactNumber: `inlineEmployees.${index}.employeeContactNumber`,
      email: `inlineEmployees.${index}.employeeEmail`
    };
    Object.entries(employeeErrors).forEach(([key, message]) => {
      errors[fieldMap[key] || key] = message;
    });
    ["jobsGeneratedBefore", "jobsGeneratedAfter", "monthlyTotalProductionCost", "productionCostPercentage", "initialProductivity"].forEach((key) => {
      if (toNumber(employee[key]) < 0) errors[`inlineEmployees.${index}.${key}`] = "Value cannot be negative.";
    });
  });
  return errors;
}

async function saveInlineEmploymentForCooperator(data, cooperatorRecord) {
  const rows = (data.inlineEmployees || []).filter(hasInlineEmploymentMonitoringData);
  if (!rows.length) return null;
  const cooperator = getCooperatorView(cooperatorRecord);
  const savedRows = [];
  for (const row of rows) {
    const employee = hasInlineEmployeeData(row) ? await employeeService.save(inlineEmployeeData(row)) : null;
    const monitoringData = {
      cooperatorId: cooperatorRecord.id,
      firmName: cooperator.firmName,
      assignedStaff: row.employmentAssignedStaff || data.officer || "Unassigned",
      assistanceYear: data.yearAwarded || new Date().getFullYear(),
      reportingMonth: row.employmentReportingMonth || currentReportingMonth(),
      benchmarkMonthlyGrossSales: 0,
      grossSales: 0,
      jobsGeneratedBefore: row.jobsGeneratedBefore || 0,
      jobsGeneratedAfter: row.jobsGeneratedAfter || 0,
      assignedEmployeeId: employee?.id || "",
      monthlyTotalProductionCost: row.monthlyTotalProductionCost || 0,
      productionCostPercentage: row.productionCostPercentage || 0,
      initialProductivity: row.initialProductivity || 0,
      remarks: row.employmentMonitoringRemarks || row.employeeRemarks || ""
    };
    const errors = salesMonitoringService.validate(monitoringData);
    if (Object.keys(errors).length) {
      throw new Error(Object.values(errors)[0] || "Generated employment monitoring could not be saved.");
    }
    const monitoringRecord = await salesMonitoringService.save(monitoringData);
    savedRows.push({ employee, monitoringRecord });
  }
  return savedRows;
}

function inlineEmployeeCard(employee = {}, index = 0) {
  const errorKey = (fieldName) => `inlineEmployees.${index}.${fieldName}`;
  const employeeCode = employee.employeeCode || employeeService.nextCode();
  return `
    <article class="service-card" data-inline-employee-card>
      <div class="service-card-head">
        <strong>Employee ${index + 1}</strong>
        <button class="btn btn-ghost" type="button" data-action="remove-inline-employee">Remove Employee</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>Employee Code</span><input name="inlineEmployeeCode${index}" data-inline-employee-field="employeeCode" value="${escapeHtml(employeeCode)}" readonly /><small>Generated automatically.</small><em class="field-error" data-error-for="${escapeHtml(errorKey("employeeCode"))}"></em></label>
        <label class="field"><span>First Name</span><input name="inlineEmployeeFirstName${index}" data-inline-employee-field="firstName" value="${escapeHtml(employee.firstName || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("firstName"))}"></em></label>
        <label class="field"><span>Last Name</span><input name="inlineEmployeeLastName${index}" data-inline-employee-field="lastName" value="${escapeHtml(employee.lastName || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("lastName"))}"></em></label>
        <label class="field"><span>Position</span><input name="inlineEmployeePosition${index}" data-inline-employee-field="employeePosition" value="${escapeHtml(employee.employeePosition || "")}" /></label>
        <label class="field"><span>Employment Status</span><select name="inlineEmployeeStatus${index}" data-inline-employee-field="employeeEmploymentStatus">${lookups.employmentStatuses.map((item) => `<option value="${escapeHtml(item)}" ${item === (employee.employeeEmploymentStatus || "Active") ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label class="field"><span>Contact Number</span><input name="inlineEmployeeContact${index}" type="tel" data-inline-employee-field="employeeContactNumber" value="${escapeHtml(employee.employeeContactNumber || "")}" placeholder="09XXXXXXXXX or +63XXXXXXXXXX" /><em class="field-error" data-error-for="${escapeHtml(errorKey("employeeContactNumber"))}"></em></label>
        <label class="field"><span>Email Address</span><input name="inlineEmployeeEmail${index}" type="email" data-inline-employee-field="employeeEmail" value="${escapeHtml(employee.employeeEmail || "")}" placeholder="name@example.com" /><em class="field-error" data-error-for="${escapeHtml(errorKey("employeeEmail"))}"></em></label>
        <label class="field"><span>Reporting Month</span><input name="inlineEmployeeMonth${index}" type="month" data-inline-employee-field="employmentReportingMonth" value="${escapeHtml(employee.employmentReportingMonth || currentReportingMonth())}" /><small>Used for employment monitoring.</small></label>
        <label class="field"><span>Assigned Staff</span><input name="inlineEmployeeStaff${index}" data-inline-employee-field="employmentAssignedStaff" value="${escapeHtml(employee.employmentAssignedStaff || "")}" /><small>Defaults to the SETUP assigned officer if blank.</small></label>
        <label class="field"><span>Jobs Generated Before</span><input name="inlineEmployeeJobsBefore${index}" type="number" min="0" step="1" data-inline-employee-field="jobsGeneratedBefore" value="${escapeHtml(employee.jobsGeneratedBefore || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("jobsGeneratedBefore"))}"></em></label>
        <label class="field"><span>Jobs Generated After</span><input name="inlineEmployeeJobsAfter${index}" type="number" min="0" step="1" data-inline-employee-field="jobsGeneratedAfter" value="${escapeHtml(employee.jobsGeneratedAfter || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("jobsGeneratedAfter"))}"></em></label>
        <label class="field"><span>Monthly Total Production Cost (PHP / ₱)</span><input name="inlineEmployeeProductionCost${index}" type="number" min="0" step="0.01" data-inline-employee-field="monthlyTotalProductionCost" value="${escapeHtml(employee.monthlyTotalProductionCost || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("monthlyTotalProductionCost"))}"></em></label>
        <label class="field"><span>Production Cost Percentage</span><input name="inlineEmployeeProductionPercent${index}" type="number" min="0" step="0.01" data-inline-employee-field="productionCostPercentage" value="${escapeHtml(employee.productionCostPercentage || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("productionCostPercentage"))}"></em></label>
        <label class="field"><span>Initial Productivity</span><input name="inlineEmployeeProductivity${index}" type="number" min="0" step="0.01" data-inline-employee-field="initialProductivity" value="${escapeHtml(employee.initialProductivity || "")}" /><em class="field-error" data-error-for="${escapeHtml(errorKey("initialProductivity"))}"></em></label>
        <label class="field span-2"><span>Employee Address</span><textarea name="inlineEmployeeAddress${index}" data-inline-employee-field="employeeAddress">${escapeHtml(employee.employeeAddress || "")}</textarea></label>
        <label class="field span-2"><span>Employment Remarks</span><textarea name="inlineEmployeeRemarks${index}" data-inline-employee-field="employmentMonitoringRemarks">${escapeHtml(employee.employmentMonitoringRemarks || employee.employeeRemarks || "")}</textarea></label>
      </div>
    </article>
  `;
}

function inlineEmployeeSectionMarkup() {
  return `
    <section class="form-section">
      <div class="form-section-heading">
        <h2>E. Generated Employment / Employees</h2>
        <p>Add one or more employees directly with this cooperator. Employee records are saved and linked to generated employment monitoring automatically.</p>
      </div>
      <div class="service-editor">
        <div data-inline-employees-list>${inlineEmployeeCard({}, 0)}</div>
        <button class="btn btn-secondary" type="button" data-action="add-inline-employee">${icon("plus")} Add Employee</button>
      </div>
    </section>
  `;
}

function renderBeneficiaryForm(id = "") {
  const existing = id ? beneficiaryService.get(id) : null;
  if (id && !existing) return errorState("Cooperator record was not found.");
  const values = beneficiaryFormValues(existing);
  const assetTotal = getEnterpriseClassification({
    land: values.assetLand,
    building: values.assetBuilding,
    equipment: values.assetEquipment,
    revolvingCapital: values.assetRevolvingCapital
  });
  return `
    ${pageHeader({
      title: id ? "Edit Cooperator" : "Add Cooperator",
      eyebrow: "SETUP / Cooperators",
      description: "Encode firm, cooperator, services availed, and SETUP refund information. Legacy project-number and fund-source fields are preserved in existing records but are not required here.",
      actions: id ? buttonLink(`/beneficiaries/${id}`, "View Profile", "users", "secondary") : buttonLink("/beneficiaries", "Back to List", "chevron", "secondary")
    })}
    <form class="record-form" data-beneficiary-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      ${formSection(
        "A. Firm and Cooperator Information",
        "Demographic classifications update from the birthday and selected Yes/No controls.",
        field({ label: "Name of Firm", name: "firmName", value: values.firmName }) +
          field({ label: "Name of Cooperator", name: "cooperatorName", value: values.cooperatorName }) +
          radioGroup({ legend: "Sex", name: "sex", options: ["Female", "Male"], value: values.sex }) +
          field({ label: "Birthday", name: "birthDate", value: values.birthDate, type: "date", max: todayIso(), help: "Used to calculate age and senior citizen classification. Age below 18 is not accepted." }) +
          `<label class="field"><span>Age</span><input readonly data-age-output value="${escapeHtml(calculateAge(values.birthDate) || "Not yet calculated")}" /></label>` +
          `<label class="field"><span>Senior Citizen Classification</span><input readonly data-senior-output value="${escapeHtml(getSeniorCitizenClassification(values.birthDate))}" /></label>` +
          radioGroup({ legend: "PWD", name: "isPwd", options: lookups.yesNoOptions, value: values.isPwd }) +
          radioGroup({ legend: "Indigenous People", name: "isIndigenousPeople", options: lookups.yesNoOptions, value: values.isIndigenousPeople }) +
          field({ label: "Contact Number", name: "contactNumber", value: values.contactNumber, type: "tel", placeholder: "09XXXXXXXXX or +63XXXXXXXXXX", help: "Numbers, spaces, +, and dashes are accepted." }) +
          field({ label: "Email Address", name: "email", value: values.email, type: "email", placeholder: "name@example.com" }) +
          textArea({ label: "Notes or remarks", name: "notes", value: values.notes, className: "span-2" })
      )}
      ${formSection(
        "B. Address Information",
        "District is derived from the validated Ilocos Sur municipality list.",
        textArea({ label: "Complete Address", name: "completeAddress", value: values.completeAddress, className: "span-2" }) +
          selectField({ label: "Municipality", name: "municipality", options: lookups.municipalities, value: values.municipality, className: "address-field" }) +
          `<label class="field address-field"><span>District</span><input name="district" readonly value="${escapeHtml(values.district || getMunicipalityDistrict(values.municipality) || "Not classified")}" /><em class="field-error" data-error-for="district"></em></label>`
      )}
      ${formSection(
        "C. Business Information",
        "Business profile fields support filtering, charts, and reports. Enterprise classification is computed from declared assets in Section D.",
        selectField({ label: "Type of Business", name: "businessType", options: lookups.businessTypes, value: values.businessType }) +
          selectField({ label: "Business Sector", name: "businessSector", options: lookups.businessSectors, value: values.businessSector }) +
          `<label class="field span-2"><span>Enterprise Classification</span><input readonly data-enterprise-classification-input value="${escapeHtml(assetTotal)}" /><small>Automatically calculated from declared assets: Micro, Small, Medium, or Not yet classified.</small></label>`
      )}
      <section class="form-section">
        <div class="form-section-heading"><h2>D. Declared Assets</h2><p>All asset amounts must be entered in Philippine pesos (PHP). Enterprise classification is calculated from these declared asset amounts.</p></div>
        <div class="form-grid">
          <div class="peso-note span-2"><strong>Currency:</strong> Philippine Peso (PHP / ₱). Enter numeric peso amounts only.</div>
          ${field({ label: "Land Value (PHP / ₱)", name: "assetLand", value: values.assetLand, type: "number", min: "0", step: "0.01", placeholder: "₱ 0.00", help: "Peso value." })}
          ${field({ label: "Building Value (PHP / ₱)", name: "assetBuilding", value: values.assetBuilding, type: "number", min: "0", step: "0.01", placeholder: "₱ 0.00", help: "Peso value." })}
          ${field({ label: "Equipment Value (PHP / ₱)", name: "assetEquipment", value: values.assetEquipment, type: "number", min: "0", step: "0.01", placeholder: "₱ 0.00", help: "Peso value." })}
          ${field({ label: "Revolving Capital (PHP / ₱)", name: "assetRevolvingCapital", value: values.assetRevolvingCapital, type: "number", min: "0", step: "0.01", placeholder: "₱ 0.00", help: "Peso value." })}
          <div class="calculation-callout span-2" aria-live="polite">
            <strong>Total Declared Assets: <span data-asset-total>${formatCurrency(0)}</span></strong>
            <span>Enterprise Classification: <b data-enterprise-classification>${escapeHtml(assetTotal)}</b></span>
          </div>
        </div>
      </section>
      <section class="form-section">
        <div class="form-section-heading"><h2>Services Availed</h2><p>Add SETUP, trainings/seminars, TACS, or laboratory test services. Subtypes appear only when required.</p></div>
        <div class="service-editor">
          <em class="field-error" data-error-for="services"></em>
          <div data-services-list>${servicesMarkup(values.services)}</div>
          <button class="btn btn-secondary" type="button" data-action="add-service">${icon("plus")} Add Service</button>
        </div>
      </section>
      ${setupSection(values)}
      ${formSection(
        "E. Generated Employment / Employee",
        "Optional employee and jobs generated details. If filled, the employee is saved and linked to this cooperator automatically.",
        field({ label: "Employee Code", name: "employeeCode", value: "" }) +
          field({ label: "First Name", name: "employeeFirstName", value: "" }) +
          field({ label: "Last Name", name: "employeeLastName", value: "" }) +
          field({ label: "Position", name: "employeePosition", value: "" }) +
          selectField({ label: "Employment Status", name: "employeeEmploymentStatus", options: lookups.employmentStatuses, value: "Active" }) +
          field({ label: "Contact Number", name: "employeeContactNumber", value: "", type: "tel", placeholder: "09XXXXXXXXX or +63XXXXXXXXXX" }) +
          field({ label: "Email Address", name: "employeeEmail", value: "", type: "email", placeholder: "name@example.com" }) +
          textArea({ label: "Employee Address", name: "employeeAddress", value: "", className: "span-2" }) +
          field({ label: "Reporting Month", name: "employmentReportingMonth", value: currentReportingMonth(), type: "month", help: "Used for employment monitoring." }) +
          field({ label: "Assigned Staff", name: "employmentAssignedStaff", value: "", help: "Defaults to the SETUP assigned officer if blank." }) +
          field({ label: "Jobs Generated Before", name: "jobsGeneratedBefore", value: "", type: "number", min: "0", step: "1" }) +
          field({ label: "Jobs Generated After", name: "jobsGeneratedAfter", value: "", type: "number", min: "0", step: "1" }) +
          field({ label: "Monthly Total Production Cost (PHP / ₱)", name: "monthlyTotalProductionCost", value: "", type: "number", min: "0", step: "0.01" }) +
          field({ label: "Production Cost Percentage", name: "productionCostPercentage", value: "", type: "number", min: "0", step: "0.01" }) +
          field({ label: "Initial Productivity", name: "initialProductivity", value: "", type: "number", min: "0", step: "0.01" }) +
          textArea({ label: "Employment Remarks", name: "employmentMonitoringRemarks", value: "", className: "span-2" })
      )}
      <div class="sticky-actions">
        <a class="btn btn-ghost" href="${id ? `/beneficiaries/${id}` : "/beneficiaries"}" data-link>Cancel</a>
        <button class="btn btn-secondary" type="submit" name="intent" value="list">Save</button>
        <button class="btn btn-primary" type="submit" name="intent" value="view">Save and View</button>
      </div>
    </form>
  `;
}

function bindBeneficiaryForm(id = "") {
  const form = document.querySelector("[data-beneficiary-form]");
  if (!form) return;
  bindDirtyForm(form);
  const generatedEmploymentHeading = [...form.querySelectorAll(".form-section-heading h2")].find((heading) => heading.textContent.trim() === "E. Generated Employment / Employee");
  generatedEmploymentHeading?.closest(".form-section")?.insertAdjacentHTML("afterend", inlineEmployeeSectionMarkup());
  generatedEmploymentHeading?.closest(".form-section")?.remove();
  form.querySelector("details.legacy-info")?.remove();
  const serviceList = form.querySelector("[data-services-list]");
  const setupProjectList = form.querySelector("[data-setup-projects-list]");
  const inlineEmployeeList = form.querySelector("[data-inline-employees-list]");
  let refundDateWarningShown = false;
  const updateAge = (showToast = false) => {
    const age = calculateAge(form.elements.birthDate.value);
    form.querySelector("[data-age-output]").value = age || "Not yet calculated";
    form.querySelector("[data-senior-output]").value = getSeniorCitizenClassification(form.elements.birthDate.value);
    if (showToast && form.elements.birthDate.value && age !== "" && Number(age) < 18) {
      createToast("Age below 18 is not accepted. Please input another birthday.", "warning");
      form.elements.birthDate.setAttribute("aria-invalid", "true");
      form.querySelector('[data-error-for="birthDate"]').textContent = "Cooperator must be at least 18 years old.";
      form.elements.birthDate.focus();
    } else if (age === "" || Number(age) >= 18) {
      form.elements.birthDate.removeAttribute("aria-invalid");
      form.querySelector('[data-error-for="birthDate"]').textContent = "";
    }
  };
  const updateDistrict = () => {
    form.elements.district.value = getMunicipalityDistrict(form.elements.municipality.value) || "Not classified";
  };
  const updateAssets = () => {
    const assets = {
      land: form.elements.assetLand.value,
      building: form.elements.assetBuilding.value,
      equipment: form.elements.assetEquipment.value,
      revolvingCapital: form.elements.assetRevolvingCapital.value
    };
    const total = Object.values(assets).reduce((sum, value) => sum + toNumber(value), 0);
    const classification = getEnterpriseClassification(assets);
    form.querySelector("[data-asset-total]").textContent = formatCurrency(total);
    form.querySelector("[data-enterprise-classification]").textContent = classification;
    if (form.querySelector("[data-enterprise-classification-input]")) form.querySelector("[data-enterprise-classification-input]").value = classification;
  };
  const updateSubtypeField = (card) => {
    const category = card.querySelector("[data-service-category]").value;
    const fieldNode = card.querySelector("[data-subtype-field]");
    const select = card.querySelector("[data-service-subtype]");
    const detailFields = card.querySelector("[data-service-detail-fields]");
    const setupNote = card.querySelector("[data-setup-service-note]");
    const remarksField = card.querySelector("[data-service-remarks-field]");
    const label = fieldNode?.querySelector("span");
    const isSetup = category === "SETUP";
    const currentValue = select?.value || "";
    const options = isSetup ? [] : lookups.serviceSubtypes[category] || [];
    fieldNode?.classList.toggle("is-hidden", !options.length);
    if (label) label.textContent = "Subtype";
    if (select) select.innerHTML = `<option value="">Select subtype</option>${options.map((item) => `<option value="${escapeHtml(item)}" ${item === currentValue ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}`;
    detailFields?.classList.toggle("is-hidden", isSetup);
    setupNote?.classList.toggle("is-hidden", !isSetup);
    remarksField?.classList.toggle("is-hidden", isSetup);
  };
  const updateSetupSection = () => {
    const hasSetup = Boolean(form.querySelector("[data-setup-project-card]"));
    const setup = form.querySelector("[data-setup-section]");
    setup?.classList.remove("is-hidden");
    if (hasSetup && setupProjectList && !setupProjectList.querySelector("[data-setup-project-card]")) {
      setupProjectList.insertAdjacentHTML("beforeend", setupProjectCard({ status: form.elements.projectStatus?.value || "Ongoing" }, 0));
      bindSetupProjectCard(setupProjectList.querySelector("[data-setup-project-card]:last-child"));
      renumberSetupProjects();
    }
    setup?.querySelectorAll("input, select, textarea").forEach((control) => {
      control.required = false;
    });
  };
  const updateFinancialPreview = () => {
    const start = form.elements.refundStart?.value || "";
    const end = form.elements.refundEnd?.value || "";
    const months = getRefundMonthCount(start, end);
    if (form.elements.numberOfMonths) form.elements.numberOfMonths.value = months || "";
    const fund = toNumber(form.elements.fundAssistance?.value);
    const monthly = toNumber(form.elements.monthlyRefund?.value);
    const total = monthly * months;
    const difference = fund - total;
    const preview = form.querySelector("[data-financial-preview]");
    if (preview) {
      preview.innerHTML = `<strong>Financial preview</strong><span>SETUP Fund Assistance: ${formatCurrency(fund)}</span><span>Expected Monthly Refund: ${formatCurrency(monthly)}</span><span>Number of Refund Months: ${months || 0}</span><span>Estimated Total Scheduled Refund: ${formatCurrency(total)}</span><span>Difference / final installment remainder: ${formatCurrency(difference)}</span>${Math.abs(difference) > Math.max(1, monthly) ? `<em class="warning-text">The scheduled total differs from the fund assistance. The final installment may need adjustment.</em>` : ""}`;
    }
  };
  const validateRefundDateRange = (showToast = false) => {
    const startInput = form.elements.refundStart;
    const endInput = form.elements.refundEnd;
    const start = startInput?.value || "";
    const end = endInput?.value || "";
    const startError = form.querySelector('[data-error-for="refundStart"]');
    const endError = form.querySelector('[data-error-for="refundEnd"]');
    if (start && end && !dateAfter(end, start)) {
      if (showToast && !refundDateWarningShown) {
        createToast("Monthly refund end cannot be earlier than monthly refund start. Please input the dates again.", "warning");
        refundDateWarningShown = true;
      }
      startInput?.setAttribute("aria-invalid", "true");
      endInput?.setAttribute("aria-invalid", "true");
      if (startError) startError.textContent = "Start date must be on or before the end date.";
      if (endError) endError.textContent = "End date cannot be earlier than the start date.";
      endInput?.focus();
      return false;
    }
    refundDateWarningShown = false;
    startInput?.removeAttribute("aria-invalid");
    endInput?.removeAttribute("aria-invalid");
    if (startError) startError.textContent = "";
    if (endError) endError.textContent = "";
    return true;
  };
  const bindServiceCard = (card) => {
    card.querySelector("[data-service-category]")?.addEventListener("change", () => {
      updateSubtypeField(card);
      updateSetupSection();
    });
    card.querySelector("[data-action='remove-service']")?.addEventListener("click", async () => {
      const hasInfo = ["[data-service-category]", "[data-service-subtype]", "[data-service-date]", "[data-service-remarks]", "[data-setup-phase-status]", "[data-setup-phase-title]", "[data-setup-phase-notes]"].some((selector) => card.querySelector(selector)?.value);
      if (hasInfo) {
        const confirmed = await confirmAction("Remove this service entry and its information?", {
          title: "Remove service?",
          confirmLabel: "Remove"
        });
        if (!confirmed) return;
      }
      card.remove();
      if (!serviceList.querySelector("[data-service-card]")) {
        serviceList.insertAdjacentHTML("beforeend", serviceCard({}, 0));
        bindServiceCard(serviceList.querySelector("[data-service-card]:last-child"));
      }
      updateSetupSection();
    });
  };
  const renumberSetupProjects = () => {
    const phaseLabels = setupPhaseOptions();
    const cards = [...form.querySelectorAll("[data-setup-project-card]")];
    cards.forEach((card, index) => {
      const label = phaseLabels[index] || `Phase ${index + 1}`;
      card.querySelector("[data-setup-phase-label]")?.replaceChildren(document.createTextNode(label));
      const removeButton = card.querySelector("[data-action='remove-setup-project']");
      if (removeButton) removeButton.disabled = cards.length <= 1;
    });
    const addButton = form.querySelector("[data-action='add-setup-project']");
    if (addButton) addButton.disabled = false;
  };
  const bindSetupProjectCard = (card) => {
    const updateSetupPhasePreview = () => {
      const refundStart = card.querySelector("[data-setup-phase-refund-start]")?.value || "";
      const refundEnd = card.querySelector("[data-setup-phase-refund-end]")?.value || "";
      const months = getRefundMonthCount(refundStart, refundEnd);
      const monthsInput = card.querySelector("[data-setup-phase-months]");
      if (monthsInput) monthsInput.value = months || "";
      const totalFund =
        toNumber(card.querySelector("[data-setup-phase-fund]")?.value) +
        toNumber(card.querySelector("[data-setup-phase-ttf]")?.value) +
        toNumber(card.querySelector("[data-setup-phase-option]")?.value) +
        toNumber(card.querySelector("[data-setup-phase-other-fees]")?.value);
      const monthly = toNumber(card.querySelector("[data-setup-phase-monthly]")?.value);
      const scheduledTotal = monthly * months;
      const preview = card.querySelector("[data-setup-phase-preview]");
      if (preview) {
        preview.innerHTML = `<strong>This phase has its own refund schedule</strong><span>Total Fund / Repayable: ${formatCurrency(totalFund)}</span><span>Expected Monthly Refund: ${formatCurrency(monthly)}</span><span>Number of Refund Months: ${months || 0}</span><span>Estimated Total Scheduled Refund: ${formatCurrency(scheduledTotal)}</span><span>Difference / final installment remainder: ${formatCurrency(totalFund - scheduledTotal)}</span>${Math.abs(totalFund - scheduledTotal) > Math.max(1, monthly) ? `<em class="warning-text">The scheduled total differs from the total fund. The final installment may need adjustment.</em>` : ""}`;
      }
    };
    const validateSetupPhaseDates = (showToast = false) => {
      const startInput = card.querySelector("[data-setup-phase-refund-start]");
      const endInput = card.querySelector("[data-setup-phase-refund-end]");
      const start = startInput?.value || "";
      const end = endInput?.value || "";
      const startError = card.querySelector("[data-setup-refund-start-error]");
      const endError = card.querySelector("[data-setup-refund-end-error]");
      if (start && end && !dateAfter(end, start)) {
        startInput?.setAttribute("aria-invalid", "true");
        endInput?.setAttribute("aria-invalid", "true");
        if (startError) startError.textContent = "Start date must be on or before the end date.";
        if (endError) endError.textContent = "End date cannot be earlier than the start date.";
        if (showToast) createToast("Monthly refund end cannot be earlier than monthly refund start. Please input the dates again.", "warning");
        endInput?.focus();
        return false;
      }
      startInput?.removeAttribute("aria-invalid");
      endInput?.removeAttribute("aria-invalid");
      if (startError) startError.textContent = "";
      if (endError) endError.textContent = "";
      return true;
    };
    const releaseInput = card.querySelector("[data-setup-phase-release]");
    releaseInput?.addEventListener("change", () => {
      const errorNode = card.querySelector("[data-setup-release-error]");
      releaseInput.removeAttribute("aria-invalid");
      if (errorNode) errorNode.textContent = "";
    });
    ["[data-setup-phase-fund]", "[data-setup-phase-monthly]", "[data-setup-phase-refund-start]", "[data-setup-phase-refund-end]", "[data-setup-phase-ttf]", "[data-setup-phase-option]", "[data-setup-phase-other-fees]"].forEach((selector) => {
      card.querySelector(selector)?.addEventListener("input", () => {
        updateSetupPhasePreview();
        validateSetupPhaseDates(false);
      });
      card.querySelector(selector)?.addEventListener("change", () => {
        updateSetupPhasePreview();
        validateSetupPhaseDates(true);
      });
    });
    card.querySelector("[data-action='remove-setup-project']")?.addEventListener("click", async () => {
      const cards = form.querySelectorAll("[data-setup-project-card]");
      if (cards.length <= 1) return;
      const hasInfo = ["[data-setup-phase-status]", "[data-setup-phase-title]", "[data-setup-phase-year]", "[data-setup-phase-officer]", "[data-setup-phase-release]", "[data-setup-phase-fund]", "[data-setup-phase-monthly]", "[data-setup-phase-refund-start]", "[data-setup-phase-refund-end]", "[data-setup-phase-notes]"].some((selector) => card.querySelector(selector)?.value);
      if (hasInfo) {
        const confirmed = await confirmAction("Remove this SETUP project phase?", {
          title: "Remove phase?",
          confirmLabel: "Remove"
        });
        if (!confirmed) return;
      }
      card.remove();
      renumberSetupProjects();
    });
    updateSetupPhasePreview();
  };
  const blockInvalidSetupReleaseDates = () => {
    let invalid = false;
    form.querySelectorAll("[data-setup-phase-release]").forEach((releaseInput) => {
      releaseInput.removeAttribute("aria-invalid");
      const errorNode = releaseInput.closest(".field")?.querySelector("[data-setup-release-error]");
      if (errorNode) errorNode.textContent = "";
    });
    form.querySelectorAll("[data-setup-project-card]").forEach((card) => {
      const startInput = card.querySelector("[data-setup-phase-refund-start]");
      const endInput = card.querySelector("[data-setup-phase-refund-end]");
      const start = startInput?.value || "";
      const end = endInput?.value || "";
      if (start && end && !dateAfter(end, start)) {
        invalid = true;
        startInput?.setAttribute("aria-invalid", "true");
        endInput?.setAttribute("aria-invalid", "true");
        const startError = card.querySelector("[data-setup-refund-start-error]");
        const endError = card.querySelector("[data-setup-refund-end-error]");
        if (startError) startError.textContent = "Start date must be on or before the end date.";
        if (endError) endError.textContent = "End date cannot be earlier than the start date.";
      }
    });
    if (invalid) createToast("Monthly refund end cannot be earlier than monthly refund start. Please input the dates again.", "warning");
    return invalid;
  };
  const renumberInlineEmployees = () => {
    const cards = [...form.querySelectorAll("[data-inline-employee-card]")];
    cards.forEach((card, index) => {
      card.querySelector(".service-card-head strong")?.replaceChildren(document.createTextNode(`Employee ${index + 1}`));
      const existingCodes = cards
        .slice(0, index)
        .map((item) => item.querySelector('[data-inline-employee-field="employeeCode"]')?.value)
        .filter(Boolean);
      const codeInput = card.querySelector('[data-inline-employee-field="employeeCode"]');
      if (codeInput && !codeInput.value) codeInput.value = employeeService.nextCode(existingCodes);
      card.querySelectorAll("[data-inline-employee-field]").forEach((control) => {
        const fieldName = control.dataset.inlineEmployeeField;
        const errorName = fieldName === "employeeCode"
          ? "employeeCode"
          : fieldName === "firstName"
            ? "firstName"
            : fieldName === "lastName"
              ? "lastName"
              : fieldName;
        control.name = `inlineEmployee${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}${index}`;
        control.closest(".field")?.querySelector(".field-error")?.setAttribute("data-error-for", `inlineEmployees.${index}.${errorName}`);
      });
      const removeButton = card.querySelector("[data-action='remove-inline-employee']");
      if (removeButton) removeButton.disabled = cards.length <= 1;
    });
  };
  const bindInlineEmployeeCard = (card) => {
    card.querySelector("[data-action='remove-inline-employee']")?.addEventListener("click", async () => {
      const cards = form.querySelectorAll("[data-inline-employee-card]");
      if (cards.length <= 1) return;
      const hasInfo = [...card.querySelectorAll("[data-inline-employee-field]")].some((control) => String(control.value || "").trim());
      if (hasInfo) {
        const confirmed = await confirmAction("Remove this employee entry?", {
          title: "Remove employee?",
          confirmLabel: "Remove"
        });
        if (!confirmed) return;
      }
      card.remove();
      renumberInlineEmployees();
    });
  };
  serviceList.querySelectorAll("[data-service-card]").forEach(bindServiceCard);
  setupProjectList?.querySelectorAll("[data-setup-project-card]").forEach(bindSetupProjectCard);
  inlineEmployeeList?.querySelectorAll("[data-inline-employee-card]").forEach(bindInlineEmployeeCard);
  renumberSetupProjects();
  renumberInlineEmployees();
  form.querySelector("[data-action='add-setup-project']")?.addEventListener("click", () => {
    const count = setupProjectList?.querySelectorAll("[data-setup-project-card]").length || 0;
    if (!setupProjectList) return;
    setupProjectList.insertAdjacentHTML("beforeend", setupProjectCard({ status: count === 0 ? "Ongoing" : "Pending" }, count));
    bindSetupProjectCard(setupProjectList.querySelector("[data-setup-project-card]:last-child"));
    renumberSetupProjects();
  });
  form.querySelector("[data-action='add-service']")?.addEventListener("click", () => {
    serviceList.insertAdjacentHTML("beforeend", serviceCard({}, serviceList.querySelectorAll("[data-service-card]").length));
    bindServiceCard(serviceList.querySelector("[data-service-card]:last-child"));
    updateSetupSection();
  });
  form.querySelector("[data-action='add-inline-employee']")?.addEventListener("click", () => {
    if (!inlineEmployeeList) return;
    const existingCodes = [...inlineEmployeeList.querySelectorAll('[data-inline-employee-field="employeeCode"]')].map((input) => input.value).filter(Boolean);
    inlineEmployeeList.insertAdjacentHTML("beforeend", inlineEmployeeCard({ employeeCode: employeeService.nextCode(existingCodes) }, inlineEmployeeList.querySelectorAll("[data-inline-employee-card]").length));
    bindInlineEmployeeCard(inlineEmployeeList.querySelector("[data-inline-employee-card]:last-child"));
    renumberInlineEmployees();
  });
  form.elements.birthDate?.addEventListener("change", () => updateAge(true));
  form.elements.municipality?.addEventListener("change", updateDistrict);
  ["assetLand", "assetBuilding", "assetEquipment", "assetRevolvingCapital"].forEach((name) => form.elements[name]?.addEventListener("input", updateAssets));
  ["fundAssistance", "monthlyRefund"].forEach((name) => form.elements[name]?.addEventListener("input", updateFinancialPreview));
  ["refundStart", "refundEnd"].forEach((name) => {
    form.elements[name]?.addEventListener("input", () => {
      updateFinancialPreview();
      validateRefundDateRange(true);
    });
    form.elements[name]?.addEventListener("change", () => validateRefundDateRange(true));
  });
  form.elements.projectStatus?.addEventListener("change", async () => {
    if (form.elements.projectStatus.value === "Terminated") {
      const confirmed = await confirmAction("This project will be excluded from Active SETUP Refund and SETUP Refund Performance calculations. Existing payment history and unpaid balance will remain visible.", {
        title: "Mark as terminated?",
        confirmLabel: "Continue"
      });
      if (!confirmed) form.elements.projectStatus.value = "Ongoing";
    }
    form.querySelector("[data-status-source]").textContent = `Current status source: ${form.elements.projectStatus.value === "Terminated" ? "Manually assigned" : "Automatically calculated"}`;
  });
  updateAge();
  updateDistrict();
  updateAssets();
  updateSetupSection();
  updateFinancialPreview();
  validateRefundDateRange(false);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (blockInvalidSetupReleaseDates()) return;
    if (!validateRefundDateRange(true)) return;
    const data = readBeneficiaryForm(form);
    const errors = { ...beneficiaryService.validate(data, id), ...validateInlineEmployment(data) };
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    const submitter = event.submitter;
    if (submitter) submitter.disabled = true;
    try {
      const record = await beneficiaryService.saveFromForm(data, id);
      const employmentResult = await saveInlineEmploymentForCooperator(data, record);
      window.__dirtyForm = false;
      createToast(`${record.firmName || "Cooperator"} ${id ? "changes saved" : "added successfully"}${employmentResult ? " with generated employment details" : ""}.`);
      navigate(submitter?.value === "view" ? `/beneficiaries/${record.id}` : "/beneficiaries");
    } catch (error) {
      if (submitter) submitter.disabled = false;
      createToast(`Cooperator was not saved: ${error.message || "Database write failed."}`, "danger");
    }
  });
}

function renderBeneficiaryDetail(id) {
  const beneficiary = beneficiaryService.getWithFinancials(id);
  if (!beneficiary) return errorState("Cooperator record was not found.");
  const cooperator = getCooperatorView(beneficiary, beneficiary.financials);
  const phaseSchedule = cooperator.hasSetup
    ? cooperator.setup.phases.flatMap((phase) => getPhaseRefundSchedule({ beneficiary, cooperator, phase }).map((row) => ({ ...row, phase: phase.phase || "Phase I" })))
    : beneficiary.financials.schedule;
  const payments = collectionService.list().filter((item) => item.beneficiaryId === id);
  const receipts = receiptService.list().filter((item) => item.beneficiaryId === id);
  const deferments = defermentService.list().filter((item) => item.beneficiaryId === id);
  const adjustments = adjustmentService.list().filter((item) => item.beneficiaryId === id);
  const documents = documentService.list().filter((item) => item.beneficiaryId === id);
  const employmentRecords = salesMonitoringService.list({ includeArchived: true, cooperatorId: id });
  const displayServices = [
    ...cooperator.services.filter((service) => service.category !== "SETUP"),
    ...(cooperator.hasSetup ? [{ category: "SETUP", subtype: "", dateAvailed: "", remarks: "SETUP project phases are shown in the SETUP Phases tab." }] : [])
  ];
  const tabs = [
    "Overview",
    "Services Availed",
    ...(cooperator.hasSetup ? ["SETUP Phases", "Refund Schedule"] : []),
    "Collections",
    "Official Receipts",
    "Deferments",
    "Adjustments",
    "Documents",
    "Generated Employment",
    "History"
  ];
  return `
    <section class="profile-header">
      <div>
        <p class="breadcrumb">SETUP / Cooperator Profile</p>
        <h1>${escapeHtml(cooperator.firmName)}</h1>
        <p>${escapeHtml(cooperator.cooperatorName)} / ${escapeHtml(cooperator.municipality || "Not provided")} / ${escapeHtml(cooperator.district || "Not classified")}</p>
        ${cooperator.hasSetup ? statusBadge(cooperator.setup.calculatedStatus) : statusBadge("Under Review")}
      </div>
      <div class="page-actions">
        ${buttonLink(`/beneficiaries/${id}/edit`, "Edit", "edit", "secondary")}
        ${buttonLink(`/collections/new?beneficiary=${id}`, "Record Payment", "cash", "primary")}
        <button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")}<span>Print Cooperator Account Statement</span></button>
      </div>
    </section>
    <nav class="tabs" aria-label="Cooperator sections">${tabs.map((tab, index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-tab="${slug(tab)}">${escapeHtml(tab)}</button>`).join("")}</nav>
    <section class="tab-panel active" data-panel="overview">
      <div class="detail-grid">
        ${detailPanel("Firm Information", [
          ["Name of Firm", cooperator.firmName],
          ["Complete Address", cooperator.completeAddress || "Not provided"],
          ["Municipality", cooperator.municipality || "Not provided"],
          ["District", cooperator.district || "Not classified"],
          ["Type of Business", cooperator.businessType || "Not provided"],
          ["Business Sector", cooperator.businessSector || "Not classified"]
        ])}
        ${detailPanel("Cooperator Information", [
          ["Name of Cooperator", cooperator.cooperatorName],
          ["Sex", cooperator.sex || "Not provided"],
          ["Birthday", formatDate(cooperator.birthDate)],
          ["Age", cooperator.age === "" ? "Not yet calculated" : cooperator.age],
          ["Senior Citizen Classification", cooperator.seniorCitizenClassification],
          ["PWD", cooperator.pwd || "Not provided"],
          ["Indigenous People", cooperator.indigenousPeople || "Not provided"],
          ["Contact", cooperator.contactNumber || "Not provided"],
          ["Email", cooperator.email || "Not provided"]
        ])}
        ${detailPanel("Declared Assets", [
          ["Land", formatCurrency(cooperator.assets.land)],
          ["Building", formatCurrency(cooperator.assets.building)],
          ["Equipment", formatCurrency(cooperator.assets.equipment)],
          ["Revolving Capital", formatCurrency(cooperator.assets.revolvingCapital)],
          ["Total Declared Assets", formatCurrency(cooperator.assets.total)],
          ["Enterprise Classification", cooperator.enterpriseClassification]
        ])}
        ${detailPanel(
          "Calculated Values",
          [
            ["Total Repayable", formatCurrency(beneficiary.financials.totalRepayable)],
            ["Total Paid", formatCurrency(beneficiary.financials.totalPaid)],
            ["Outstanding Balance", formatCurrency(beneficiary.financials.outstandingBalance)],
            ["Amount Due", formatCurrency(beneficiary.financials.amountDue)],
            ["Past Due", formatCurrency(beneficiary.financials.pastDue)],
            ["Advance Payment", formatCurrency(beneficiary.financials.advancePayment)],
            ["Refund Percentage", `${beneficiary.financials.refundPercentage.toFixed(1)}%`],
            ["Adjusted Due Date", formatDate(beneficiary.financials.adjustedDueDate)],
            ["Latest Payment", beneficiary.financials.latestPayment ? formatDate(beneficiary.financials.latestPayment.paymentDate) : "None"],
            ["Latest Receipt", beneficiary.financials.latestReceipt ? beneficiary.financials.latestReceipt.orNumber : "None"]
          ],
          true
        )}
      </div>
      ${activityTimeline(id)}
    </section>
    <section class="tab-panel" data-panel="services-availed">
      <section class="service-timeline">
        ${displayServices.length
          ? displayServices.map((service) => `<article class="service-card"><strong>${escapeHtml(service.category)}</strong><span>${escapeHtml(service.subtype || "No subtype required")}</span><time>${formatDate(service.dateAvailed)}</time><p>${escapeHtml(service.remarks || (service.legacy ? "Legacy SETUP refund project record." : "No remarks."))}</p></article>`).join("")
          : emptyState("No services recorded", "No services availed have been added for this cooperator.")}
      </section>
    </section>
    ${cooperator.hasSetup ? `<section class="tab-panel" data-panel="setup-phases">
      ${renderSetupPhaseTable(cooperator.setup.phases, beneficiary, cooperator)}
    </section>` : ""}
    ${cooperator.hasSetup ? `<section class="tab-panel" data-panel="refund-schedule"><div class="calculation-callout">Each SETUP phase has its own refund schedule. Payments are applied only to the selected phase/project.</div>${renderSchedule(phaseSchedule, id)}</section>` : ""}
    <section class="tab-panel" data-panel="collections">${renderSimplePaymentTable(payments)}</section>
    <section class="tab-panel" data-panel="official-receipts">${renderSimpleReceiptTable(receipts)}</section>
    <section class="tab-panel" data-panel="deferments">${renderSimpleDefermentTable(deferments)}</section>
    <section class="tab-panel" data-panel="adjustments">${renderSimpleAdjustmentTable(adjustments)}</section>
    <section class="tab-panel" data-panel="documents">${renderSimpleDocumentTable(documents)}</section>
    <section class="tab-panel" data-panel="generated-employment">${renderCooperatorEmploymentTable(employmentRecords, id)}</section>
    <section class="tab-panel" data-panel="history">${activityTimeline(id, true)}</section>
  `;
}

function detailPanel(title, rows, calculated = false) {
  return `<section class="panel detail-panel ${calculated ? "read-only-panel" : ""}"><div class="panel-head"><h2>${escapeHtml(title)}</h2>${calculated ? `<span title="Calculated from current database records.">${icon("info")} Calculated values</span>` : ""}</div><dl>${rows
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("")}</dl></section>`;
}

function renderCooperatorEmploymentTable(records = [], cooperatorId = "") {
  const summary = salesMonitoringService.employmentSummary(records);
  return `
    <section class="summary-grid compact">
      ${summaryCard({ label: "Jobs Before", value: String(summary.jobsBefore), context: "Baseline employment", iconName: "users" })}
      ${summaryCard({ label: "Jobs After", value: String(summary.jobsAfter), context: "Current/generated employment", iconName: "users" })}
      ${summaryCard({ label: "Additional Jobs", value: String(summary.additionalJobs), context: `${summary.employmentGrowth.toFixed(1)}% growth`, iconName: "check" })}
    </section>
    <div class="action-row">${buttonLink(`/sales-monitoring/new?cooperatorId=${encodeURIComponent(cooperatorId)}`, "Add Employment Monitoring", "plus", "primary")}${buttonLink(`/beneficiaries/${encodeURIComponent(cooperatorId)}/edit`, "Add Employee", "users", "secondary")}</div>
    ${dashboardTableCard({
      title: "Generated Employment Monitoring",
      description: "Monthly jobs before/after values and added employee names are read from Sales Monitoring records.",
      rows: records,
      emptyMessage: "No employment monitoring records linked to this cooperator yet.",
      columns: [
        { key: "month", label: "Reporting Month", render: (row) => escapeHtml(row.monthKey) },
        { key: "before", label: "Jobs Before", align: "right", render: (row) => formatNumber(row.jobsGeneratedBefore) },
        { key: "after", label: "Jobs After", align: "right", render: (row) => formatNumber(row.jobsGeneratedAfter) },
        { key: "additional", label: "Additional Jobs", align: "right", render: (row) => formatNumber(row.additionalJobs) },
        { key: "employee", label: "Added Employee", render: (row) => escapeHtml(row.employeeName) },
        { key: "productivity", label: "Initial Productivity", align: "right", render: (row) => Number(row.initialProductivity || 0).toFixed(2) }
      ]
    })}
  `;
}

function renderSetupPhaseTable(phases = [], beneficiary = {}, cooperator = {}) {
  if (!phases.length) return emptyState("No SETUP phases", "No SETUP phase records are linked to this cooperator.");
  return `
    <section class="panel setup-phase-panel">
      <div class="panel-head">
        <h2>SETUP Phase Records</h2>
        <p>Each phase is a separate refund-bearing SETUP project for this firm.</p>
      </div>
      <div class="setup-phase-table-wrap">
        <table class="setup-phase-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Status</th>
              <th>Archive State</th>
              <th>Project / Details</th>
              <th>Year</th>
              <th>Officer</th>
              <th>Release Date</th>
              <th>Total Fund</th>
              <th>Monthly Refund</th>
              <th>Refund Start</th>
              <th>Due Date</th>
              <th>Total Paid</th>
              <th>Balance</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${phases
              .map((phase) => {
                const financials = getPhaseFinancials({ beneficiary, cooperator, phase });
                return `
                  <tr>
                    <td><strong>${escapeHtml(phase.phase || "SETUP")}</strong></td>
                    <td>${statusBadge(phase.status || "Pending")}</td>
                    <td>${phase.archived ? statusBadge("Archived") : statusBadge("Active")}</td>
                    <td>${escapeHtml(phase.projectTitle || "Not provided")}</td>
                    <td>${escapeHtml(phase.yearAwarded || "Not provided")}</td>
                    <td>${escapeHtml(phase.officer || "Not provided")}</td>
                    <td>${formatDate(phase.releaseDate)}</td>
                    <td>${formatCurrency(financials.totalRepayable)}</td>
                    <td>${formatCurrency(phase.monthlyRefund)}</td>
                    <td>${formatDate(phase.refundStart)}</td>
                    <td>${formatDate(phase.refundEnd)}</td>
                    <td>${formatCurrency(financials.totalPaid)}</td>
                    <td>${formatCurrency(financials.outstandingBalance)}</td>
                    <td>${escapeHtml(phase.notes || "No remarks.")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function activityTimeline(beneficiaryId, full = false) {
  const events = getActivityEvents(beneficiaryId).slice(0, full ? 100 : 5);
  return `<section class="panel timeline-panel"><div class="panel-head"><h2>Activity Timeline</h2><p>System actions and related record dates for this cooperator.</p></div>${
    events.length
      ? `<ol class="timeline">${events.map((event) => `<li><span></span><strong>${escapeHtml(event.action)}</strong><time>${formatDate(event.date)}</time></li>`).join("")}</ol>`
      : emptyState("No activity yet", "No saved activity, collection, receipt, deferment, adjustment, or document record exists for this cooperator.")
  }</section>`;
}

function eventDate(value) {
  return String(value || "").slice(0, 10);
}

function getActivityEvents(beneficiaryId) {
  const state = repository.getSnapshot();
  const beneficiary = repository.get("beneficiaries", beneficiaryId);
  const events = [];
  const addEvent = (action, date, tieBreaker = "") => {
    const normalizedDate = eventDate(date);
    if (!action || !normalizedDate) return;
    events.push({ action, date: normalizedDate, tieBreaker });
  };

  addEvent("Cooperator created", beneficiary?.createdAt, beneficiary?.id);
  if (beneficiary?.updatedAt && eventDate(beneficiary.updatedAt) !== eventDate(beneficiary.createdAt)) {
    addEvent("Cooperator updated", beneficiary.updatedAt, beneficiary.id);
  }

  state.activity
    .filter((item) => item.beneficiaryId === beneficiaryId)
    .forEach((item) => addEvent(item.action, item.timestamp, item.id));
  state.payments
    .filter((item) => item.beneficiaryId === beneficiaryId && !item.archived)
    .forEach((item) => addEvent(`Payment recorded${item.referenceNumber ? ` (${item.referenceNumber})` : ""}`, item.dateReceived || item.paymentDate, item.id));
  state.receipts
    .filter((item) => item.beneficiaryId === beneficiaryId && !item.archived)
    .forEach((item) => addEvent(`Official receipt added${item.orNumber ? ` (${item.orNumber})` : ""}`, item.orDate, item.id));
  state.deferments
    .filter((item) => item.beneficiaryId === beneficiaryId && !item.archived)
    .forEach((item) => addEvent(`Deferment ${item.status || "recorded"}`, item.approvalDate || item.requestDate || item.startDate, item.id));
  state.adjustments
    .filter((item) => item.beneficiaryId === beneficiaryId && !item.archived)
    .forEach((item) => addEvent(`Adjustment created${item.type ? ` (${item.type})` : ""}`, item.effectiveDate, item.id));
  state.documents
    .filter((item) => item.beneficiaryId === beneficiaryId && !item.archived)
    .forEach((item) => addEvent(`Document added${item.category ? ` (${item.category})` : ""}`, item.documentDate, item.id));

  const deduped = new Map();
  events.forEach((event) => {
    const key = `${event.action}|${event.date}`;
    if (!deduped.has(key)) deduped.set(key, event);
  });
  return [...deduped.values()].sort((a, b) => b.date.localeCompare(a.date) || b.tieBreaker.localeCompare(a.tieBreaker));
}

function renderSchedule(schedule, beneficiaryId) {
  const paid = schedule.filter((item) => item.status === "Paid").length;
  const showPhase = schedule.some((item) => item.phase);
  const columns = [
    ...(showPhase ? [{ key: "phase", label: "Phase", sortable: true, render: (row) => escapeHtml(row.phase || "Phase I") }] : []),
    { key: "month", label: "Refund Month", sortable: true, render: (row) => escapeHtml(row.refundMonth) },
    { key: "expected", label: "Expected Amount", sortable: true, render: (row) => formatCurrency(row.expectedAmount) },
    { key: "paid", label: "Amount Paid", sortable: true, render: (row) => formatCurrency(row.amountPaid) },
    { key: "remaining", label: "Remaining Amount", sortable: true, render: (row) => formatCurrency(row.remainingAmount) },
    { key: "dueDate", label: "Due Date", render: (row) => formatDate(row.dueDate) },
    { key: "paymentDate", label: "Payment Date", render: (row) => formatDate(row.paymentDate) },
    { key: "or", label: "Official Receipt", render: (row) => escapeHtml(row.orNumber || "Pending") },
    { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
    { key: "actions", label: "Actions", render: () => `<a href="/collections/new?beneficiary=${beneficiaryId}" data-link>Record payment</a>` }
  ];
  return `
    <section class="panel progress-panel">
      <div class="panel-head"><h2>Refund Schedule</h2><p>${paid} of ${schedule.length} monthly obligations paid. Schedule follows monthly due dates.</p></div>
      <div class="progress-meter"><span style="width:${(paid / Math.max(schedule.length, 1)) * 100}%"></span></div>
      <div class="action-row"><button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")} Print refund schedule</button><button class="btn btn-secondary" type="button" data-action="export-schedule">${icon("download")} Export schedule</button><a class="btn btn-primary" href="/collections/new?beneficiary=${beneficiaryId}" data-link>${icon("cash")} Record payment</a></div>
    </section>
    ${dataTable({ columns, rows: schedule.map((item) => ({ ...item, searchText: `${item.installmentNumber} ${item.status} ${item.orNumber}` })) })}
    <section class="mobile-record-list">${schedule
      .map((item) =>
        mobileRecordCard({
          title: item.refundMonth,
          subtitle: `Due ${formatDate(item.dueDate)}`,
          status: item.status,
          meta: [
            { label: "Expected", value: formatCurrency(item.expectedAmount) },
            { label: "Paid", value: formatCurrency(item.amountPaid) },
            { label: "Remaining", value: formatCurrency(item.remainingAmount) },
            { label: "OR", value: escapeHtml(item.orNumber || "Pending") }
          ],
          actions: `<details><summary>Payment details</summary><p>${escapeHtml(item.remarks || "No extra remarks.")}</p></details>`
        })
      )
      .join("")}</section>
  `;
}

function renderSimplePaymentTable(payments) {
  return dataTable({
    rows: payments.map((payment) => ({ ...payment, searchText: `${payment.referenceNumber} ${payment.paymentDate} ${payment.amount}` })),
    emptyMessage: "No payment records are associated with this cooperator.",
    columns: [
      { key: "date", label: "Payment Date", render: (row) => formatDate(row.paymentDate) },
      { key: "amount", label: "Amount Paid", render: (row) => formatCurrency(row.amount) },
      { key: "reference", label: "Payment Receipt", render: (row) => row.referenceNumber ? `<code>${escapeHtml(row.referenceNumber)}</code>` : "Not provided" },
        { key: "actions", label: "Actions", render: (row) => `<div class="row-actions"><a href="/collections/${row.id}" data-link>View</a><a href="/collections/${row.id}/edit" data-link>Edit</a><button type="button" data-action="delete-record" data-type="payments" data-id="${row.id}">Delete</button></div>` }
    ]
  });
}

function renderSimpleReceiptTable(receipts) {
  return dataTable({
    rows: receipts.map((receipt) => ({ ...receipt, searchText: `${receipt.orNumber} ${receipt.remarks}` })),
    emptyMessage: "No official receipt records are associated with this cooperator.",
    columns: [
      { key: "or", label: "OR Number", render: (row) => `<code>${escapeHtml(row.orNumber)}</code>` },
      { key: "date", label: "OR Date", render: (row) => formatDate(row.orDate) },
      { key: "amount", label: "OR Amount", render: (row) => formatCurrency(row.amount) },
      { key: "remarks", label: "Remarks", render: (row) => escapeHtml(row.remarks) },
      { key: "actions", label: "Actions", render: (row) => `<button type="button" data-action="delete-record" data-type="receipts" data-id="${row.id}">Delete</button>` }
    ]
  });
}

function renderSimpleDefermentTable(records) {
  return dataTable({
    rows: records.map((item) => ({ ...item, searchText: `${item.reason} ${item.status}` })),
    emptyMessage: "No deferments are associated with this cooperator.",
    columns: [
      { key: "request", label: "Request Date", render: (row) => formatDate(row.requestDate) },
      { key: "range", label: "Deferment Period", render: (row) => `${formatDate(row.startDate)} - ${formatDate(row.endDate)}` },
      { key: "months", label: "Deferred Months", render: (row) => row.months },
      { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
      { key: "actions", label: "Actions", render: (row) => `<button type="button" data-action="delete-record" data-type="deferments" data-id="${row.id}">Delete</button>` }
    ]
  });
}

function renderSimpleAdjustmentTable(records) {
  return dataTable({
    rows: records.map((item) => ({ ...item, searchText: `${item.type} ${item.reason}` })),
    emptyMessage: "No adjustments are associated with this cooperator.",
    columns: [
      { key: "type", label: "Type", render: (row) => escapeHtml(row.type) },
      { key: "date", label: "Effective Date", render: (row) => formatDate(row.effectiveDate) },
      { key: "amount", label: "Amount", render: (row) => formatCurrency(row.amount) },
      { key: "reason", label: "Reason", render: (row) => escapeHtml(row.reason) },
      { key: "actions", label: "Actions", render: (row) => `<button type="button" data-action="delete-record" data-type="adjustments" data-id="${row.id}">Delete</button>` }
    ]
  });
}

function renderSimpleDocumentTable(records) {
  return dataTable({
    rows: records.map((item) => ({ ...item, searchText: `${item.category} ${item.fileName}` })),
    emptyMessage: "No documents are associated with this cooperator.",
    columns: [
      { key: "category", label: "Category", render: (row) => escapeHtml(row.category) },
      { key: "date", label: "Document Date", render: (row) => formatDate(row.documentDate) },
      { key: "file", label: "File", render: (row) => escapeHtml(row.fileName) },
      { key: "actions", label: "Actions", render: (row) => `<button type="button">Preview</button><button type="button">Download</button><button type="button" data-action="delete-record" data-type="documents" data-id="${row.id}">Delete</button>` }
    ]
  });
}

function bindBeneficiaryDetail(id) {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
    });
  });
  document.querySelectorAll("[data-action='print-page']").forEach((button) => button.addEventListener("click", () => window.print()));
  document.querySelector("[data-action='export-schedule']")?.addEventListener("click", () => {
    const rows = getSchedule(id).map((item) => [item.refundMonth, item.expectedAmount, item.amountPaid, item.remainingAmount, item.dueDate, item.paymentDate, item.orNumber, item.status]);
    downloadCsv("individual-refund-schedule.csv", [["Refund Month", "Expected", "Paid", "Remaining", "Due Date", "Payment Date", "Official Receipt", "Status"], ...rows]);
  });
  bindTableSorts(document);
  bindDeleteActions();
}

function renderCollections() {
  const payments = collectionService.list();
  const receiptPaymentIds = new Set(repository.getSnapshot().receipts.filter((receipt) => !receipt.archived).map((receipt) => receipt.paymentId));
  const rows = payments.map((item) => ({ ...item, searchText: `${item.beneficiary?.firmName} ${item.projectTitle} ${item.referenceNumber} ${item.status}` }));
  const page = pagedRows(rows, "/collections");
  return `
    ${pageHeader({
      title: "Collections",
      eyebrow: "Internal / Payment Recording",
      description: "Record payment date, amount paid, payment receipt, and attachment.",
      actions: buttonLink("/collections/new", "Record Payment", "cash", "primary")
    })}
    <section class="list-toolbar">${searchInput("Search visible payments")}<p class="result-count"><strong data-visible-count>${page.rows.length}</strong> shown, ${page.start}-${page.end} of ${page.totalRows} payments</p></section>
    ${dataTable({
      rows: page.rows,
      columns: [
        { key: "beneficiary", label: "Cooperator", sortable: true, render: (row) => escapeHtml(row.beneficiary ? getCooperatorView(row.beneficiary).firmName : "") },
        { key: "project", label: "Project", render: (row) => escapeHtml(row.projectTitle) },
        { key: "date", label: "Payment Date", sortable: true, render: (row) => formatDate(row.paymentDate) },
        { key: "amount", label: "Amount Paid", sortable: true, render: (row) => formatCurrency(row.amount) },
        { key: "reference", label: "Payment Receipt", render: (row) => row.referenceNumber ? `<code>${escapeHtml(row.referenceNumber)}</code>` : "Not provided" },
        { key: "or", label: "OR Status", render: (row) => statusBadge(receiptPaymentIds.has(row.id) ? "Matched" : "Missing OR") },
      { key: "actions", label: "Actions", render: (row) => `<div class="row-actions"><a href="/collections/${row.id}" data-link>View</a><a href="/collections/${row.id}/edit" data-link>Edit</a><button type="button" data-action="delete-record" data-type="payments" data-id="${row.id}">Delete</button></div>` }
      ]
    })}
    ${page.controls}
  `;
}

function bindCollections() {
  bindSearch(document);
  bindTableSorts(document);
  bindDeleteActions();
}

function renderPaymentForm() {
  const selected = new URLSearchParams(location.search).get("beneficiary") || "";
  return `
    ${pageHeader({
      title: "Record Payment",
      eyebrow: "Internal / Collections",
      description: "Record payment date, amount paid, receipt, and attachment.",
      actions: buttonLink("/collections", "Back to Collections", "chevron", "secondary")
    })}
    <form class="record-form" data-payment-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      <section class="form-section">
        <div class="form-section-heading"><h2>Payment Details</h2><p>Only payment date, amount paid, receipt, and attachment are recorded here.</p></div>
        <div class="form-grid">
          <label class="field"><span>Cooperator*</span><select name="beneficiaryId" required><option value="">Select cooperator</option>${beneficiaryOptionList(selected)}</select><em class="field-error" data-error-for="beneficiaryId"></em></label>
          <label class="field"><span>Project / SETUP Phase*</span><select name="projectTitle" data-selected-project><option value="">Select cooperator first</option></select><em class="field-error" data-error-for="projectTitle"></em></label>
          ${field({ label: "Payment Date", name: "paymentDate", type: "date", value: todayIso(), required: true })}
          ${field({ label: "Amount Paid", name: "amount", type: "number", min: "0.01", step: "0.01", required: true })}
          ${field({ label: "Payment Receipt", name: "referenceNumber", help: "Official receipt, acknowledgment receipt, or receipt reference number." })}
          ${fileUpload({ label: "Payment Attachment", name: "paymentAttachment" })}
        </div>
      </section>
      <section class="panel payment-history-panel">
        <div class="panel-head"><div><h2>Payment History</h2><p data-balance-summary>Select a cooperator to show current balance and saved payment history.</p></div></div>
        <div data-payment-history>${renderPaymentHistory(selected)}</div>
      </section>
      <section class="panel review-panel" data-payment-review hidden></section>
      <div class="sticky-actions">
        <a class="btn btn-ghost" href="/collections" data-link>Cancel</a>
        <button class="btn btn-secondary" type="button" data-action="review-payment">Review Payment</button>
        <button class="btn btn-primary" type="submit" disabled data-confirm-payment>Confirm and Save</button>
      </div>
    </form>
  `;
}

function phaseOptionsForBeneficiary(beneficiary) {
  if (!beneficiary) return [];
  const cooperator = getCooperatorView(beneficiary, beneficiary.financials);
  return (cooperator.setup?.phases || [])
    .filter((phase) => isRefundApplicableToPhase(phase.phase))
    .filter((phase) => !phase.archived)
    .map((phase) => ({
      label: setupPhasePaymentKey(phase, cooperator),
      phase
    }));
}

function getPaymentHistoryRows(beneficiaryId, projectTitle = "") {
  if (!beneficiaryId) return [];
  const state = repository.getSnapshot();
  const receiptsByPaymentId = new Map(state.receipts.filter((receipt) => !receipt.archived).map((receipt) => [receipt.paymentId, receipt]));
  const beneficiary = beneficiaryService.getWithFinancials(beneficiaryId);
  const cooperator = beneficiary ? getCooperatorView(beneficiary, beneficiary.financials) : null;
  const phaseOptions = beneficiary ? phaseOptionsForBeneficiary(beneficiary) : [];
  const phaseOneTitle = phaseOptions[0]?.label || "";
  const selectedTitle = projectTitle || phaseOneTitle;
  return collectionService
    .list()
    .filter((payment) => payment.beneficiaryId === beneficiaryId)
    .filter((payment) => {
      if (!selectedTitle) return true;
      if (payment.projectTitle === selectedTitle) return true;
      if (selectedTitle === phaseOneTitle && cooperator) {
        const legacyTitles = new Set(["", beneficiary.project?.title || "", beneficiary.setup?.projectTitle || "", cooperator.setup?.projectTitle || ""].map((item) => String(item || "").trim()));
        return legacyTitles.has(String(payment.projectTitle || "").trim()) && !/\/\s*Phase\s+/i.test(String(payment.projectTitle || ""));
      }
      return false;
    })
    .filter((payment) => !["Pending", "Returned", "Replaced", "Cancelled"].includes(payment.status))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.id.localeCompare(a.id))
    .map((payment) => {
      const receipt = receiptsByPaymentId.get(payment.id);
      return {
        id: payment.id,
        datePaid: payment.paymentDate,
        amountPaid: Number(payment.amount || 0),
        orNumber: receipt?.orNumber || payment.referenceNumber || ""
      };
    });
}

function renderPaymentHistory(beneficiaryId, projectTitle = "") {
  if (!beneficiaryId) return emptyState("No cooperator selected", "Choose a cooperator to show payment history.");
  const rows = getPaymentHistoryRows(beneficiaryId, projectTitle);
  if (!rows.length) return emptyState("No payment history", "No saved payment records are associated with this cooperator.");
  const totalPaid = rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
  return `
    <div class="table-wrap">
      <table class="data-table payment-history-table">
        <thead><tr><th>Date Paid</th><th>Amount Paid</th><th>OR#</th></tr></thead>
        <tbody>${rows
          .map((item) => `<tr><td>${formatDate(item.datePaid)}</td><td>${formatCurrency(item.amountPaid)}</td><td>${escapeHtml(item.orNumber || "No OR#")}</td></tr>`)
          .join("")}</tbody>
        <tfoot><tr><td>Total Paid</td><td>${formatCurrency(totalPaid)}</td><td></td></tr></tfoot>
      </table>
    </div>
  `;
}

function getAutomaticPaymentAllocations(beneficiaryId, amount, projectTitle = "") {
  return collectionService.buildAllocations(beneficiaryId, amount, projectTitle);
}

function bindPaymentForm() {
  const form = document.querySelector("[data-payment-form]");
  if (!form) return;
  bindDirtyForm(form);
  let paymentDateWarningShown = false;
  const validatePaymentDateFlow = (showToast = false) => {
    const data = readForm(form);
    const errors = {};
    const addError = (field, message) => {
      errors[field] = message;
    };
    if (data.paymentDate && data.paymentDate > todayIso()) addError("paymentDate", "Payment date cannot be in the future.");
    ["paymentDate"].forEach((field) => {
      const input = form.elements[field];
      const output = form.querySelector(`[data-error-for="${field}"]`);
      if (errors[field]) {
        input?.setAttribute("aria-invalid", "true");
        if (output) output.textContent = errors[field];
      } else {
        input?.removeAttribute("aria-invalid");
        if (output) output.textContent = "";
      }
    });
    const firstInvalidField = Object.keys(errors)[0];
    if (firstInvalidField) {
      if (showToast && !paymentDateWarningShown) {
        createToast(Object.values(errors)[0], "warning");
        paymentDateWarningShown = true;
      }
      form.elements[firstInvalidField]?.focus();
      return false;
    }
    paymentDateWarningShown = false;
    return true;
  };
  const updateBeneficiary = () => {
    const beneficiary = beneficiaryService.getWithFinancials(form.elements.beneficiaryId.value);
    const projectSelect = form.querySelector("[data-selected-project]");
    const phaseOptions = phaseOptionsForBeneficiary(beneficiary);
    const currentProject = projectSelect.value;
    projectSelect.innerHTML = phaseOptions.length
      ? phaseOptions.map((item, index) => `<option value="${escapeHtml(item.label)}" ${item.label === currentProject || (!currentProject && index === 0) ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")
      : `<option value="">No refund-bearing SETUP phase</option>`;
    const context = beneficiary && phaseOptions.length ? collectionService.getPaymentPhaseContext(beneficiary.id, projectSelect.value) : null;
    form.querySelector("[data-balance-summary]").textContent = beneficiary
      ? `Current balance ${formatCurrency(context?.financials?.outstandingBalance || 0)} / amount due ${formatCurrency(context?.financials?.amountDue || 0)}`
      : "Select a cooperator to show current balance and saved payment history.";
    form.querySelector("[data-payment-history]").innerHTML = renderPaymentHistory(beneficiary?.id || "", projectSelect.value);
  };
  form.elements.beneficiaryId.addEventListener("change", updateBeneficiary);
  form.elements.projectTitle.addEventListener("change", updateBeneficiary);
  form.elements.paymentDate?.addEventListener("change", () => validatePaymentDateFlow(true));
  form.elements.paymentDate?.addEventListener("input", () => validatePaymentDateFlow(true));
  updateBeneficiary();
  document.querySelector("[data-action='review-payment']").addEventListener("click", () => {
    if (!validatePaymentDateFlow(true)) return;
    const data = readForm(form);
    const allocations = getAutomaticPaymentAllocations(data.beneficiaryId, data.amount, data.projectTitle);
    const errors = collectionService.validate(data, allocations);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    const review = form.querySelector("[data-payment-review]");
    review.hidden = false;
    review.innerHTML = `<div class="panel-head"><h2>Review Payment</h2><p>Confirm details before saving.</p></div><dl><div><dt>Project / SETUP Phase</dt><dd>${escapeHtml(data.projectTitle || "Not selected")}</dd></div><div><dt>Payment Date</dt><dd>${formatDate(data.paymentDate)}</dd></div><div><dt>Amount Paid</dt><dd>${formatCurrency(data.amount)}</dd></div><div><dt>Payment Receipt</dt><dd>${escapeHtml(data.referenceNumber || "None")}</dd></div><div><dt>Posting</dt><dd>Applied automatically to unpaid monthly refund balance for the selected phase.</dd></div></dl>`;
    form.querySelector("[data-confirm-payment]").disabled = false;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validatePaymentDateFlow(true)) return;
    const data = readForm(form);
    const allocations = getAutomaticPaymentAllocations(data.beneficiaryId, data.amount, data.projectTitle);
    const errors = collectionService.validate(data, allocations);
    const attachment = form.elements.paymentAttachment?.files?.[0] || null;
    if (attachment) {
      const fileError = documentService.validateFile(attachment);
      if (fileError) errors.paymentAttachment = fileError;
    }
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    const payment = collectionService.create(data, allocations);
    let attachmentUploaded = true;
    if (attachment) {
      try {
        await documentService.create({
          beneficiaryId: data.beneficiaryId,
          category: "Payment Attachment",
          relatedTransaction: payment.id,
          documentDate: data.paymentDate,
          description: `Payment attachment for ${data.referenceNumber || payment.id}`
        }, attachment);
      } catch (error) {
        console.warn("Payment attachment upload failed:", error);
        attachmentUploaded = false;
      }
    }
    window.__dirtyForm = false;
    createToast(attachmentUploaded ? "Payment recorded successfully." : "Payment recorded, but the attachment could not be uploaded.", attachmentUploaded ? "success" : "warning");
    navigate("/collections");
  });
}

function renderPaymentDetail(id) {
  const payment = collectionService.get(id);
  const attachment = documentService.list().find((item) => item.relatedTransaction === payment?.id && item.category === "Payment Attachment");
  if (!payment) return errorState("Payment record was not found.");
  return `
    ${pageHeader({ title: "Payment Detail", eyebrow: "Internal / Collections", actions: `${buttonLink("/collections", "Back", "chevron", "secondary")}<button class="btn btn-ghost" type="button" data-action="delete-record" data-type="payments" data-id="${payment.id}">Delete</button>` })}
    <section class="panel detail-panel"><dl>
      <div><dt>Cooperator</dt><dd>${escapeHtml(payment.beneficiary ? getCooperatorView(payment.beneficiary).firmName : "")}</dd></div>
      <div><dt>Payment Date</dt><dd>${formatDate(payment.paymentDate)}</dd></div>
      <div><dt>Amount Paid</dt><dd>${formatCurrency(payment.amount)}</dd></div>
      <div><dt>Payment Receipt</dt><dd>${payment.referenceNumber ? `<code>${escapeHtml(payment.referenceNumber)}</code>` : "Not provided"}</dd></div>
      <div><dt>Payment Attachment</dt><dd>${attachment ? escapeHtml(attachment.fileName) : "No attachment uploaded"}</dd></div>
    </dl></section>
  `;
}

function bindPaymentDetail() {
  bindDeleteActions("/collections");
}

function renderPaymentEditForm(id) {
  const payment = collectionService.get(id);
  if (!payment) return errorState("Payment record was not found.");
  const attachment = documentService.list().find((item) => item.relatedTransaction === payment.id && item.category === "Payment Attachment");
  return `
    ${pageHeader({
      title: "Edit Payment",
      eyebrow: "Internal / Collections",
      description: "Update payment date, amount paid, receipt, and attachment.",
      actions: buttonLink(`/collections/${id}`, "Back to Payment", "chevron", "secondary")
    })}
    <form class="record-form" data-payment-edit-form novalidate>
      <input type="hidden" name="id" value="${escapeHtml(payment.id)}" />
      <input type="hidden" name="beneficiaryId" value="${escapeHtml(payment.beneficiaryId)}" />
      <div class="error-summary" data-error-summary hidden></div>
      <section class="form-section">
        <div class="form-section-heading"><h2>Payment Details</h2><p>Edit payment date, amount paid, receipt, and attachment.</p></div>
        <div class="form-grid">
          <label class="field"><span>Cooperator</span><input name="cooperatorName" readonly value="${escapeHtml(payment.beneficiary ? getCooperatorView(payment.beneficiary).firmName : "")}" /></label>
          <label class="field"><span>Project</span><input name="projectTitle" readonly value="${escapeHtml(payment.projectTitle)}" /></label>
          ${field({ label: "Payment Date", name: "paymentDate", type: "date", value: payment.paymentDate, required: true })}
          ${field({ label: "Amount Paid", name: "amount", type: "number", min: "0.01", step: "0.01", value: String(payment.amount || ""), required: true })}
          ${field({ label: "Payment Receipt", name: "referenceNumber", value: payment.referenceNumber || "", help: "Official receipt, acknowledgment receipt, or receipt reference number." })}
        </div>
        ${attachment ? `<div class="existing-attachment"><span>Current attachment:</span> <code>${escapeHtml(attachment.fileName)}</code><button type="button" class="btn btn-ghost btn-sm" data-action="remove-attachment">Remove</button></div>` : ""}
        ${fileUpload({ label: "Payment Attachment", name: "paymentAttachment" })}
      </section>
      <section class="panel payment-history-panel">
        <div class="panel-head"><div><h2>Payment History</h2><p data-balance-summary>Current balance and saved payment history for this cooperator.</p></div></div>
        <div data-payment-history>${renderPaymentHistory(payment.beneficiaryId)}</div>
      </section>
      <div class="sticky-actions">
        <a class="btn btn-ghost" href="/collections/${id}" data-link>Cancel</a>
        <button class="btn btn-primary" type="submit" data-action="save-payment-edit">Save Changes</button>
      </div>
    </form>
  `;
}

function bindPaymentEditForm(id) {
  const form = document.querySelector("[data-payment-edit-form]");
  if (!form) return;
  bindDirtyForm(form);
  let paymentDateWarningShown = false;
  const validatePaymentDateFlow = (showToast = false) => {
    const data = readForm(form);
    const errors = {};
    if (data.paymentDate && data.paymentDate > todayIso()) errors.paymentDate = "Payment date cannot be in the future.";
    ["paymentDate"].forEach((field) => {
      const input = form.elements[field];
      const output = form.querySelector(`[data-error-for="${field}"]`);
      if (errors[field]) {
        input?.setAttribute("aria-invalid", "true");
        if (output) output.textContent = errors[field];
      } else {
        input?.removeAttribute("aria-invalid");
        if (output) output.textContent = "";
      }
    });
    const firstInvalidField = Object.keys(errors)[0];
    if (firstInvalidField) {
      if (showToast && !paymentDateWarningShown) {
        createToast(Object.values(errors)[0], "warning");
        paymentDateWarningShown = true;
      }
      form.elements[firstInvalidField]?.focus();
      return false;
    }
    paymentDateWarningShown = false;
    return true;
  };
  form.elements.paymentDate?.addEventListener("change", () => validatePaymentDateFlow(true));
  form.elements.paymentDate?.addEventListener("input", () => validatePaymentDateFlow(true));
  let removeAttachment = false;
  form.querySelector("[data-action='remove-attachment']")?.addEventListener("click", (e) => {
    e.preventDefault();
    removeAttachment = true;
    const container = form.querySelector(".existing-attachment");
    if (container) container.remove();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validatePaymentDateFlow(true)) return;
    const data = readForm(form);
    const existingPayment = collectionService.get(id);
    const errors = {};
    if (!data.paymentDate) errors.paymentDate = "Payment date is required.";
    else if (!isValidDate(data.paymentDate)) errors.paymentDate = "Payment date is invalid.";
    else if (data.paymentDate > todayIso()) errors.paymentDate = "Payment date cannot be in the future.";
    const amount = toNumber(data.amount);
    if (amount <= 0) errors.amount = "Payment amount must be greater than zero.";
    if (data.referenceNumber?.trim() && data.referenceNumber.trim() !== existingPayment.referenceNumber) {
      const duplicate = repository.list("payments").find((item) => item.id !== id && item.referenceNumber && item.referenceNumber === data.referenceNumber.trim());
      if (duplicate) errors.referenceNumber = "This payment receipt already exists in current records.";
    }
    const financials = collectionService.getPaymentPhaseContext(existingPayment.beneficiaryId, existingPayment.projectTitle)?.financials || getBeneficiaryFinancials(existingPayment.beneficiaryId);
    if (financials && amount > financials.outstandingBalance + existingPayment.amount) {
      errors.amount = "Amount paid cannot exceed the total remaining balance.";
    }
    const attachment = form.elements.paymentAttachment?.files?.[0] || null;
    if (attachment) {
      const fileError = documentService.validateFile(attachment);
      if (fileError) errors.paymentAttachment = fileError;
    }
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    try {
      collectionService.update(id, data);
      if (attachment) {
        try {
          await documentService.create({
            beneficiaryId: existingPayment.beneficiaryId,
            category: "Payment Attachment",
            relatedTransaction: id,
            documentDate: data.paymentDate,
            description: `Payment attachment for ${data.referenceNumber || id}`
          }, attachment);
        } catch (err) {
          console.warn("Payment attachment upload failed:", err);
        }
      }
      window.__dirtyForm = false;
      createToast("Payment updated successfully.");
      navigate(`/collections/${id}`);
    } catch (err) {
      createToast("Payment could not be updated. Please review the details and try again.", "danger");
    }
  });
}

function renderReceipts() {
  const receipts = receiptService.list();
  const rows = receipts.map((item) => ({ ...item, searchText: `${item.orNumber} ${item.beneficiary?.firmName} ${item.payment?.referenceNumber}` }));
  const page = pagedRows(rows, "/receipts");
  return `
    ${pageHeader({ title: "Official Receipts", eyebrow: "Internal / Receipts", description: "Track OR records and warnings before reconciliation.", actions: buttonLink("/receipts/new", "Add Official Receipt", "receipt", "primary") })}
    <section class="list-toolbar">${searchInput("Search visible receipts")}<p class="result-count"><strong data-visible-count>${page.rows.length}</strong> shown, ${page.start}-${page.end} of ${page.totalRows} receipts</p></section>
    ${dataTable({
      rows: page.rows,
      columns: [
        { key: "or", label: "OR Number", render: (row) => `<code>${escapeHtml(row.orNumber)}</code>` },
        { key: "date", label: "OR Date", render: (row) => formatDate(row.orDate) },
        { key: "beneficiary", label: "Cooperator", render: (row) => escapeHtml(row.beneficiary ? getCooperatorView(row.beneficiary).firmName : "") },
        { key: "payment", label: "Related Payment", render: (row) => `<code>${escapeHtml(row.payment?.referenceNumber || "Missing")}</code>` },
        { key: "paymentAmount", label: "Payment Amount", render: (row) => formatCurrency(row.payment?.amount || 0) },
        { key: "orAmount", label: "OR Amount", render: (row) => formatCurrency(row.amount) },
        { key: "difference", label: "Difference", render: (row) => formatCurrency(row.amount - (row.payment?.amount || 0)) },
        { key: "status", label: "Reconciliation Status", render: (row) => statusBadge(Math.abs(row.amount - (row.payment?.amount || 0)) > 0.01 ? "Amount Mismatch" : "Matched") },
        { key: "actions", label: "Actions", render: (row) => `<button type="button">View</button><button type="button" data-action="delete-record" data-type="receipts" data-id="${row.id}">Delete</button>` }
      ]
    })}
    ${page.controls}
  `;
}

function bindReceipts() {
  bindSearch(document);
  bindDeleteActions();
}

function renderReceiptForm() {
  return `
    ${pageHeader({ title: "Record Official Receipt", eyebrow: "Internal / Receipts", description: "Validate OR number, date, amount, and related payment.", actions: buttonLink("/receipts", "Back to Receipts", "chevron", "secondary") })}
    <form class="record-form" data-receipt-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      ${formSection(
        "Official Receipt Details",
        "Warnings compare OR details against the selected saved payment.",
        `<label class="field"><span>Cooperator*</span><select name="beneficiaryId" required><option value="">Select cooperator</option>${beneficiaryOptionList()}</select><em class="field-error" data-error-for="beneficiaryId"></em></label>
        <label class="field"><span>Related payment*</span><select name="paymentId" required><option value="">Select payment</option></select><em class="field-error" data-error-for="paymentId"></em></label>` +
          field({ label: "Official receipt number", name: "orNumber", required: true, help: "Stored as a string." }) +
          field({ label: "Official receipt date", name: "orDate", type: "date", value: todayIso(), required: true }) +
          field({ label: "Official receipt amount", name: "amount", type: "number", step: "0.01", min: "0.01", required: true }) +
          field({ label: "Penalty amount", name: "penaltyAmount", type: "number", step: "0.01", min: "0", value: 0 }) +
          fileUpload({ label: "OR attachment", name: "attachmentName" }) +
          textArea({ label: "Remarks", name: "remarks", className: "span-2" })
      )}
      <section class="panel warning-panel" data-receipt-warnings hidden></section>
      <div class="sticky-actions"><a class="btn btn-ghost" href="/receipts" data-link>Cancel</a><button class="btn btn-primary" type="submit">Save Receipt</button></div>
    </form>
  `;
}

function bindReceiptForm() {
  const form = document.querySelector("[data-receipt-form]");
  bindDirtyForm(form);
  const updatePayments = () => {
    const payments = collectionService
      .list()
      .filter((item) => item.beneficiaryId === form.elements.beneficiaryId.value && !["Pending", "Returned", "Replaced", "Cancelled"].includes(item.status));
    form.elements.paymentId.innerHTML = `<option value="">Select payment</option>${payments.map((item) => `<option value="${item.id}">${escapeHtml(item.referenceNumber)} - ${formatCurrency(item.amount)}</option>`).join("")}`;
  };
  const updateWarnings = () => {
    const data = readForm(form);
    const payment = collectionService.get(data.paymentId);
    const warnings = [];
    if (receiptService.list({ includeArchived: true }).some((item) => item.orNumber === data.orNumber)) warnings.push("Duplicate OR number.");
    if (payment && toNumber(data.amount) && Math.abs(payment.amount - toNumber(data.amount)) > 0.01) warnings.push("OR amount differs from payment amount.");
    if (payment && data.orDate && data.orDate < payment.paymentDate) warnings.push("OR date is earlier than payment date.");
    const panel = form.querySelector("[data-receipt-warnings]");
    panel.hidden = warnings.length === 0;
    panel.innerHTML = warnings.length ? `<div class="panel-head"><h2>Frontend Warnings</h2></div><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  };
  form.elements.beneficiaryId.addEventListener("change", () => {
    updatePayments();
    updateWarnings();
  });
  form.addEventListener("input", updateWarnings);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readForm(form);
    const errors = receiptService.validate(data);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      focusFirstError(form);
      return;
    }
    receiptService.create(data);
    window.__dirtyForm = false;
    createToast("Official receipt saved.");
    navigate("/receipts");
  });
}

function renderReconciliation() {
  const records = reconciliationService.list();
  const counts = Object.fromEntries(lookups.reconciliationStatuses.map((status) => [status, records.filter((item) => item.status === status).length]));
  const rows = records.map((item) => ({ ...item, searchText: `${item.beneficiary?.firmName} ${item.payment.referenceNumber} ${item.receipt?.orNumber || ""} ${item.status}` }));
  const page = pagedRows(rows, "/reconciliation");
  return `
    ${pageHeader({ title: "Reconciliation", eyebrow: "Internal / Review Workspace", description: "Compare payment records against official receipts.", actions: buttonLink("/receipts/new", "Link Receipt", "receipt", "primary") })}
    <section class="summary-grid compact">${lookups.reconciliationStatuses.map((status) => summaryCard({ label: status, value: String(counts[status] || 0), context: "Payment/OR records", iconName: status === "Matched" ? "check" : "alert" })).join("")}</section>
    <section class="list-toolbar">${searchInput("Search visible reconciliation rows")}<label>Status <select data-recon-status><option value="">All</option>${lookups.reconciliationStatuses.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></label><p class="result-count"><strong data-visible-count>${page.rows.length}</strong> shown, ${page.start}-${page.end} of ${page.totalRows} rows</p></section>
    ${dataTable({
      rows: page.rows,
      columns: [
        { key: "beneficiary", label: "Cooperator", render: (row) => escapeHtml(row.beneficiary ? getCooperatorView(row.beneficiary).firmName : "") },
        { key: "reference", label: "Payment Reference", render: (row) => `<code>${escapeHtml(row.payment.referenceNumber)}</code>` },
        { key: "paymentDate", label: "Payment Date", render: (row) => formatDate(row.payment.paymentDate) },
        { key: "paymentAmount", label: "Payment Amount", render: (row) => formatCurrency(row.payment.amount) },
        { key: "or", label: "OR Number", render: (row) => `<code>${escapeHtml(row.receipt?.orNumber || "Missing")}</code>` },
        { key: "orDate", label: "OR Date", render: (row) => formatDate(row.receipt?.orDate) },
        { key: "orAmount", label: "OR Amount", render: (row) => formatCurrency(row.receipt?.amount || 0) },
        { key: "difference", label: "Difference", render: (row) => `<span class="${row.difference ? "amount-warning" : ""}">${formatCurrency(row.difference)}</span>` },
        { key: "status", label: "Reconciliation Status", render: (row) => statusBadge(row.status) },
        { key: "actions", label: "Actions", render: (row) => `<button type="button" data-action="compare-record" data-id="${row.payment.id}">Compare</button><button type="button" data-action="mark-reviewed">Mark reviewed</button>` }
      ]
    })}
    ${page.controls}
    <aside class="comparison-drawer" data-comparison-drawer aria-label="Side-by-side comparison"></aside>
  `;
}

function bindReconciliation() {
  bindSearch(document);
  document.querySelector("[data-recon-status]")?.addEventListener("change", (event) => {
    const status = event.target.value.toLowerCase();
    document.querySelectorAll("[data-record-row]").forEach((row) => {
      row.hidden = status && !row.textContent.toLowerCase().includes(status);
    });
  });
  document.querySelectorAll("[data-action='compare-record']").forEach((button) => {
    button.addEventListener("click", () => {
      const item = reconciliationService.list().find((record) => record.payment.id === button.dataset.id);
      const drawer = document.querySelector("[data-comparison-drawer]");
      drawer.classList.add("open");
      drawer.innerHTML = `<div class="drawer-head"><strong>Payment vs OR</strong><button class="icon-btn" type="button" data-close-comparison>${icon("close")}</button></div><div class="compare-grid"><section><h3>Payment</h3><p>${escapeHtml(item.beneficiary?.firmName || "")}</p><strong>${formatCurrency(item.payment.amount)}</strong><code>${escapeHtml(item.payment.referenceNumber)}</code><span>${formatDate(item.payment.paymentDate)}</span></section><section><h3>Official Receipt</h3><p>${escapeHtml(item.receipt?.orNumber || "Missing OR")}</p><strong>${formatCurrency(item.receipt?.amount || 0)}</strong><span>${formatDate(item.receipt?.orDate)}</span>${statusBadge(item.status)}</section></div>`;
      drawer.querySelector("[data-close-comparison]").addEventListener("click", () => drawer.classList.remove("open"));
    });
  });
  document.querySelectorAll("[data-action='mark-reviewed']").forEach((button) => button.addEventListener("click", () => createToast("Marked as reviewed in the frontend workspace.")));
}

function renderDeferments() {
  const records = defermentService.list();
  return `
    ${pageHeader({ title: "Deferments", eyebrow: "Internal / Deferment Records", description: "Record external deferment approvals and preview schedule effects.", actions: buttonLink("/deferments/new", "Add Deferment", "calendar", "primary") })}
    <section class="list-toolbar">${searchInput("Search cooperator, reason, or status")}</section>
    ${renderSimpleDefermentTable(records)}
    <section class="mobile-record-list">${records.map((item) => mobileRecordCard({ title: item.beneficiary?.firmName || "", subtitle: item.reason, status: item.status, meta: [{ label: "Period", value: `${formatDate(item.startDate)} - ${formatDate(item.endDate)}` }, { label: "Months", value: item.months }], actions: `<button class="btn btn-ghost" type="button" data-action="delete-record" data-type="deferments" data-id="${item.id}">Delete</button>` })).join("")}</section>
  `;
}

function bindDeferments() {
  bindSearch(document);
  bindDeleteActions();
}

function renderDefermentForm() {
  const selected = new URLSearchParams(location.search).get("beneficiary") || "";
  return `
    ${pageHeader({ title: "Add Deferment", eyebrow: "Internal / Deferments", description: "No in-system approval workflow; record only externally completed status.", actions: buttonLink("/deferments", "Back", "chevron", "secondary") })}
    <form class="record-form" data-deferment-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      ${formSection(
        "Deferment Record",
        "Approved deferments demonstrate adjusted due dates and affected installments.",
        `<label class="field"><span>Cooperator*</span><select name="beneficiaryId" required><option value="">Select cooperator</option>${beneficiaryOptionList(selected)}</select><em class="field-error" data-error-for="beneficiaryId"></em></label>` +
          field({ label: "Request date", name: "requestDate", type: "date", value: todayIso(), required: true }) +
          field({ label: "Deferment start date", name: "startDate", type: "date", required: true }) +
          field({ label: "Deferment end date", name: "endDate", type: "date", required: true }) +
          field({ label: "Deferred months", name: "months", type: "number", min: "1", required: true }) +
          textArea({ label: "Reason", name: "reason", required: true, className: "span-2" }) +
          field({ label: "Approval date", name: "approvalDate", type: "date" }) +
          field({ label: "Approved by", name: "approvedBy" }) +
          selectField({ label: "Recorded status", name: "status", options: lookups.defermentStatuses, value: "Approved Externally" }) +
          fileUpload({ label: "Supporting document" }) +
          textArea({ label: "Remarks", name: "remarks", className: "span-2" })
      )}
      <section class="panel effect-preview" data-deferment-preview>${emptyState("No preview yet", "Select a cooperator and dates to preview schedule effects.")}</section>
      <div class="sticky-actions"><a class="btn btn-ghost" href="/deferments" data-link>Cancel</a><button class="btn btn-primary" type="submit">Save Deferment</button></div>
    </form>
  `;
}

function bindDefermentForm() {
  const form = document.querySelector("[data-deferment-form]");
  bindDirtyForm(form);
  let defermentDateWarningShown = false;
  const validateDefermentDateRange = (showToast = false) => {
    const start = form.elements.startDate?.value || "";
    const end = form.elements.endDate?.value || "";
    const startError = form.querySelector('[data-error-for="startDate"]');
    const endError = form.querySelector('[data-error-for="endDate"]');
    if (start && end && !dateAfter(end, start)) {
      if (showToast && !defermentDateWarningShown) {
        createToast("Deferment end date cannot be earlier than deferment start date. Please input the dates again.", "warning");
        defermentDateWarningShown = true;
      }
      form.elements.startDate.setAttribute("aria-invalid", "true");
      form.elements.endDate.setAttribute("aria-invalid", "true");
      if (startError) startError.textContent = "Start date must be on or before the end date.";
      if (endError) endError.textContent = "End date cannot be earlier than the start date.";
      form.elements.endDate.focus();
      return false;
    }
    defermentDateWarningShown = false;
    form.elements.startDate?.removeAttribute("aria-invalid");
    form.elements.endDate?.removeAttribute("aria-invalid");
    if (startError) startError.textContent = "";
    if (endError) endError.textContent = "";
    return true;
  };
  const preview = () => {
    const beneficiary = beneficiaryService.getWithFinancials(form.elements.beneficiaryId.value);
    if (!beneficiary) return;
    const months = Number(form.elements.months.value || 0);
    form.querySelector("[data-deferment-preview]").innerHTML = `<div class="panel-head"><h2>Projected Effect</h2></div><dl><div><dt>Adjusted due date</dt><dd>${formatDate(addMonthsSafe(beneficiary.financials.adjustedDueDate, months))}</dd></div><div><dt>Affected installments</dt><dd>${getSchedule(beneficiary.id).filter((item) => item.dueDate >= form.elements.startDate.value && item.dueDate <= form.elements.endDate.value).length}</dd></div><div><dt>Updated amount due preview</dt><dd>${formatCurrency(Math.max(0, beneficiary.financials.amountDue - months * beneficiary.financial.monthlyRefundAmount))}</dd></div></dl>`;
  };
  form.addEventListener("input", preview);
  ["startDate", "endDate"].forEach((field) => {
    form.elements[field]?.addEventListener("change", () => validateDefermentDateRange(true));
    form.elements[field]?.addEventListener("input", () => validateDefermentDateRange(true));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateDefermentDateRange(true)) return;
    const data = readForm(form);
    const errors = defermentService.validate(data);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) return focusFirstError(form);
    defermentService.create(data);
    window.__dirtyForm = false;
    createToast("Deferment saved.");
    navigate("/deferments");
  });
}

function addMonthsSafe(date, months) {
  return addMonths(date, months);
}

function renderAdjustments() {
  const records = adjustmentService.list();
  return `
    ${pageHeader({ title: "Account Adjustments", eyebrow: "Internal / Adjustments", description: "Represent changes as separate records instead of editable balance fields.", actions: buttonLink("/adjustments/new", "Create Adjustment", "edit", "primary") })}
    <section class="list-toolbar">${searchInput("Search cooperator, type, or reason")}</section>
    ${renderSimpleAdjustmentTable(records)}
  `;
}

function bindAdjustments() {
  bindSearch(document);
  bindDeleteActions();
}

function renderAdjustmentForm() {
  return `
    ${pageHeader({ title: "Create Adjustment", eyebrow: "Internal / Adjustments", description: "Preview the projected effect before saving the adjustment record.", actions: buttonLink("/adjustments", "Back", "chevron", "secondary") })}
    <form class="record-form" data-adjustment-form novalidate>
      <div class="error-summary" data-error-summary hidden></div>
      ${formSection(
        "Adjustment Details",
        "Never edit balance directly; use this adjustment record.",
        `<label class="field"><span>Cooperator*</span><select name="beneficiaryId" required><option value="">Select cooperator</option>${beneficiaryOptionList()}</select><em class="field-error" data-error-for="beneficiaryId"></em></label>` +
          selectField({ label: "Adjustment type", name: "type", options: lookups.adjustmentTypes, required: true }) +
          field({ label: "Effective date", name: "effectiveDate", type: "date", value: todayIso(), required: true }) +
          field({ label: "Amount", name: "amount", type: "number", min: "0", step: "0.01" }) +
          field({ label: "Previous value", name: "previousValue" }) +
          field({ label: "New value", name: "newValue" }) +
          textArea({ label: "Reason", name: "reason", required: true, className: "span-2" }) +
          field({ label: "Approved by", name: "approvedBy" }) +
          fileUpload({ label: "Supporting document" }) +
          textArea({ label: "Remarks", name: "remarks", className: "span-2" })
      )}
      <section class="panel effect-preview" data-adjustment-preview>${emptyState("No preview yet", "Select a cooperator and amount to preview the projected effect.")}</section>
      <div class="sticky-actions"><a class="btn btn-ghost" href="/adjustments" data-link>Cancel</a><button class="btn btn-primary" type="submit">Save Adjustment</button></div>
    </form>
  `;
}

function bindAdjustmentForm() {
  const form = document.querySelector("[data-adjustment-form]");
  bindDirtyForm(form);
  const preview = () => {
    const beneficiary = beneficiaryService.getWithFinancials(form.elements.beneficiaryId.value);
    if (!beneficiary) return;
    const amount = toNumber(form.elements.amount.value);
    const type = form.elements.type.value;
    const direction = ["Added Fee", "Penalty Adjustment"].includes(type) ? 1 : ["Waived Amount", "Write-off", "Equipment Pull-out", "Terminated Project", "Withdrawn Project"].includes(type) ? -1 : 0;
    form.querySelector("[data-adjustment-preview]").innerHTML = `<div class="panel-head"><h2>Projected Effect</h2></div><dl><div><dt>Current service-derived balance</dt><dd>${formatCurrency(beneficiary.financials.outstandingBalance)}</dd></div><div><dt>Projected balance</dt><dd>${formatCurrency(Math.max(0, beneficiary.financials.outstandingBalance + direction * amount))}</dd></div><div><dt>Representation</dt><dd>Separate adjustment record; no direct balance field.</dd></div></dl>`;
  };
  form.addEventListener("input", preview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readForm(form);
    const errors = adjustmentService.validate(data);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) return focusFirstError(form);
    adjustmentService.create(data);
    window.__dirtyForm = false;
    createToast("Adjustment saved.");
    navigate("/adjustments");
  });
}

function renderDocuments() {
  const records = documentService.list();
  return `
    ${pageHeader({ title: "Documents", eyebrow: "Internal / Document Management", description: "Frontend-only upload organization ready for backend storage integration.", actions: "" })}
    <form class="panel upload-workspace" data-document-form>
      <div class="panel-head"><h2>Upload Supporting Document</h2><p>Validates type and size in the frontend.</p></div>
      <div class="form-grid">
        ${selectField({ label: "Document category", name: "category", options: lookups.documentCategories, required: true })}
        <label class="field"><span>Cooperator association</span><select name="beneficiaryId"><option value="">Select cooperator</option>${beneficiaryOptionList()}</select></label>
        ${field({ label: "Related transaction", name: "relatedTransaction" })}
        ${field({ label: "Document date", name: "documentDate", type: "date", value: todayIso() })}
        ${textArea({ label: "Description", name: "description", className: "span-2" })}
        ${fileUpload({ label: "Choose file", name: "documentFile" })}
      </div>
      <div class="action-row"><button class="btn btn-primary" type="submit">${icon("upload")} Add Document</button></div>
    </form>
    <section class="list-toolbar">${searchInput("Search file, category, cooperator, or transaction")}</section>
    ${dataTable({
      rows: records.map((item) => ({ ...item, searchText: `${item.category} ${item.fileName} ${item.beneficiary?.firmName} ${item.relatedTransaction}` })),
      columns: [
        { key: "category", label: "Category", render: (row) => escapeHtml(row.category) },
        { key: "beneficiary", label: "Cooperator", render: (row) => escapeHtml(row.beneficiary ? getCooperatorView(row.beneficiary).firmName : "Unassigned") },
        { key: "project", label: "Project", render: (row) => escapeHtml(row.projectTitle) },
        { key: "related", label: "Related Transaction", render: (row) => escapeHtml(row.relatedTransaction) },
        { key: "date", label: "Document Date", render: (row) => formatDate(row.documentDate) },
        { key: "file", label: "File", render: (row) => escapeHtml(row.fileName) },
        { key: "actions", label: "Actions", render: (row) => `<button type="button">Preview</button><button type="button">Download</button><button type="button">Replace</button><button type="button" data-action="archive-document" data-id="${row.id}">Archive</button><button type="button" data-action="delete-record" data-type="documents" data-id="${row.id}">Delete</button>` }
      ]
    })}
  `;
}

function bindDocuments() {
  bindSearch(document);
  const form = document.querySelector("[data-document-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = form.elements.documentFile.files[0];
    const fileError = documentService.validateFile(file);
    if (fileError) {
      form.querySelector('[data-error-for="documentFile"]').textContent = fileError;
      return;
    }
    await documentService.create(readForm(form), file);
    createToast("Document added to the current frontend session.");
    renderApp();
  });
  document.querySelectorAll("[data-action='archive-document']").forEach((button) => {
    button.addEventListener("click", () => {
      documentService.archive(button.dataset.id);
      createToast("Document archived.");
      renderApp();
    });
  });
  bindDeleteActions();
}

function renderReports() {
  const query = getQuery();
  const selectedType = query.type || reportService.reportTypes[0];
  const rows = reportService.getPreview(selectedType, query);
  const officerOptions = [...new Set(beneficiaryService.list().map((item) => getCooperatorView(item).setup.assignedProjectOfficer).filter(Boolean))].sort();
  return `
    <div class="print-report-page">
      ${pageHeader({ title: "Reports", eyebrow: "Internal / Report Center", description: "Preview, print, and export collection reports.", actions: "" })}
      <section class="control-panel report-filters">
        <label>Report <select data-report-filter="type">${reportService.reportTypes.map((item) => `<option ${item === selectedType ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>As-of date <input type="date" data-report-filter="asOf" value="${escapeHtml(query.asOf || todayIso())}" /></label>
        <label>Date from <input type="date" data-report-filter="dateFrom" value="${escapeHtml(query.dateFrom || "")}" /></label>
        <label>Date to <input type="date" data-report-filter="dateTo" value="${escapeHtml(query.dateTo || "")}" /></label>
        <label>Project year <select data-report-filter="year"><option value="">All</option>${yearOptions(query.year)}</select></label>
        <label>Municipality <select data-report-filter="municipality"><option value="">All</option>${lookups.municipalities.map((item) => `<option ${item === query.municipality ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>District <select data-report-filter="district"><option value="">All</option>${lookups.districts.map((item) => `<option ${item === query.district ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Business sector <select data-report-filter="businessSector"><option value="">All</option>${lookups.businessSectors.map((item) => `<option ${item === query.businessSector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Assigned Project Officer <select data-report-filter="officer"><option value="">All</option>${officerOptions.map((item) => `<option ${item === query.officer ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label>Project status <select data-report-filter="projectStatus"><option value="">All</option>${lookups.setupProjectStatuses.map((item) => `<option ${item === query.projectStatus ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <button class="btn btn-ghost" type="button" data-action="reset-reports">Reset filters</button>
      </section>
      <section class="action-row">
        <button class="btn btn-secondary" type="button" data-action="print-page">${icon("print")} Print</button>
        <button class="btn btn-secondary" type="button" data-action="export-report-csv">${icon("download")} Export CSV</button>
        <button class="btn btn-secondary" type="button" data-action="export-report-xlsx">Export Excel</button>
        <button class="btn btn-secondary" type="button" data-action="export-report-pdf">Export PDF</button>
      </section>
      <p class="applied-filters">${Object.entries(query)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" / ") || "No filters applied."}</p>
      ${reportPreview(selectedType, query, rows)}
    </div>
  `;
}

function bindReports() {
  document.querySelectorAll("[data-report-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const filters = {};
      document.querySelectorAll("[data-report-filter]").forEach((item) => {
        filters[item.dataset.reportFilter] = item.value;
      });
      setQuery("/reports", filters);
    });
  });
  document.querySelector("[data-action='reset-reports']")?.addEventListener("click", () => navigate("/reports"));
  document.querySelector("[data-action='print-page']")?.addEventListener("click", () => window.print());
  document.querySelector("[data-action='export-report-csv']")?.addEventListener("click", () => {
    const query = getQuery();
    const rows = reportService.getPreview(query.type || reportService.reportTypes[0], query);
    const columns = Object.keys(rows[0] || {});
    downloadCsv("report-preview.csv", [columns, ...rows.map((row) => columns.map((key) => row[key]))]);
  });
  document.querySelector("[data-action='export-report-xlsx']")?.addEventListener("click", () => {
    const query = getQuery();
    const type = query.type || reportService.reportTypes[0];
    downloadXlsx(`${slug(type)}.xlsx`, type, reportService.getPreview(type, query));
  });
  document.querySelector("[data-action='export-report-pdf']")?.addEventListener("click", () => {
    const query = getQuery();
    const type = query.type || reportService.reportTypes[0];
    downloadPdf(`${slug(type)}.pdf`, type, reportService.getPreview(type, query));
  });
}

function renderImport() {
  const step = uiState.importStep;
  const payload = uiState.importPayload;
  const steps = ["Upload File", "Select Sheet", "Map Columns", "Preview Records", "Review Validation Errors", "Review Duplicates", "Confirm Import", "Import Result"];
  const nextLabel = step === steps.length ? "Restart" : step === 7 ? "Import to Database" : "Next";
  return `
    ${pageHeader({ title: "Data Import", eyebrow: "Internal / Historical Spreadsheet Import", description: "Import cooperator and SETUP project rows from XLSX, XLS, or CSV files into Supabase.", actions: "" })}
    <section class="wizard">
      <ol class="wizard-steps">${steps.map((item, index) => `<li class="${index + 1 === step ? "active" : index + 1 < step ? "done" : ""}"><span>${index + 1}</span>${escapeHtml(item)}</li>`).join("")}</ol>
      <div class="panel wizard-panel">${renderImportStep(step, payload)}</div>
      <div class="sticky-actions"><button class="btn btn-ghost" type="button" data-action="import-back" ${step === 1 ? "disabled" : ""}>Back</button><button class="btn btn-primary" type="button" data-action="import-next">${nextLabel}</button></div>
    </section>
  `;
}

function renderImportStep(step, payload) {
  if (step === 1) return `<h2>Upload File</h2><p>Use XLSX, XLS, or CSV. Valid cooperator rows will be saved to the database on confirmation.</p><label class="file-upload">${icon("upload")}<span>Choose spreadsheet</span><small>XLSX, XLS, or CSV up to 15 MB.</small><input type="file" data-import-file accept=".xlsx,.xls,.csv" /></label><em class="field-error" data-import-file-error></em>`;
  if (!payload) return emptyState("No import file", "Upload a file to continue.");
  if (step === 2) return `<h2>Select Sheet</h2><p>${escapeHtml(payload.fileName)} contains ${payload.sheets.length} sheet(s).</p><div class="choice-list">${payload.sheets.map((sheet) => `<label><input type="radio" name="sheet" value="${escapeHtml(sheet)}" ${sheet === payload.selectedSheet ? "checked" : ""} /><span>${escapeHtml(sheet)}</span></label>`).join("")}</div>`;
  if (step === 3) return `<h2>Map Columns</h2><p>Map spreadsheet columns to cooperator and SETUP fields. Required fields are marked with an asterisk.</p><div class="mapping-grid">${importService.fields.map((fieldInfo) => `<label>${escapeHtml(fieldInfo.label)}${fieldInfo.required ? " *" : ""}<select data-import-map="${escapeHtml(fieldInfo.key)}"><option value="">Not mapped</option>${payload.columns.map((column) => `<option value="${escapeHtml(column)}" ${payload.mapping[fieldInfo.key] === column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select></label>`).join("")}</div>`;
  if (step === 4) return `<h2>Preview Records</h2><p>Showing up to 25 valid rows that will be imported.</p>${payload.preview.length ? dataTable({ rows: payload.preview.map((item) => ({ ...item, searchText: Object.values(item).join(" ") })), columns: Object.keys(payload.preview[0]).map((key) => ({ key, label: key, render: (row) => escapeHtml(row[key]) })) }) : emptyState("No valid rows", "Fix the mapping or spreadsheet rows before importing.")}`;
  if (step === 5) return `<h2>Review Validation Errors</h2><div class="import-stats"><strong>${payload.validCount}</strong><span>Valid</span><strong>${payload.invalidCount}</strong><span>Invalid</span></div>${payload.errors.length ? `<ul class="error-list">${payload.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><button class="btn btn-secondary" type="button" data-action="download-import-errors">${icon("download")} Download error report</button>` : emptyState("No validation errors", "All mapped rows passed validation.")}`;
  if (step === 6) return `<h2>Review Duplicates</h2>${payload.duplicates.length ? `<ul class="error-list">${payload.duplicates.map((item) => `<li>Duplicate identifier: <code>${escapeHtml(item)}</code></li>`).join("")}</ul>` : emptyState("No duplicates", "No duplicate identifiers were found.")}`;
  if (step === 7) return `<h2>Confirm Import</h2><p>${payload.validCount} valid cooperator record(s) will be saved to the database. ${payload.invalidCount} invalid row(s) will be skipped.</p><div class="progress-meter"><span style="width:${payload.validCount ? 100 : 0}%"></span></div>`;
  return `<h2>Import Result</h2><div class="success-state">${icon("check")}<strong>${payload.importedCount || 0} cooperator record(s) imported to the database</strong><p>${payload.invalidCount} invalid row(s) skipped.</p></div>`;
}

function bindImport() {
  const fileInput = document.querySelector("[data-import-file]");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files[0];
    const error = importService.validateFile(file);
    document.querySelector("[data-import-file-error]").textContent = error;
    if (!error) {
      try {
        uiState.importPayload = await importService.parseFile(file);
        createToast("Spreadsheet parsed.");
        renderApp();
      } catch (parseError) {
        document.querySelector("[data-import-file-error]").textContent = "Could not parse this spreadsheet. Check the file and try again.";
        console.error(parseError);
      }
    }
  });
  document.querySelectorAll("[name='sheet']").forEach((input) => {
    input.addEventListener("change", () => {
      uiState.importPayload = importService.selectSheet(uiState.importPayload, input.value);
      renderApp();
    });
  });
  document.querySelectorAll("[data-import-map]").forEach((select) => {
    select.addEventListener("change", () => {
      const mapping = { ...uiState.importPayload.mapping };
      document.querySelectorAll("[data-import-map]").forEach((field) => {
        mapping[field.dataset.importMap] = field.value;
      });
      uiState.importPayload = importService.updateMapping(uiState.importPayload, mapping);
      renderApp();
    });
  });
  document.querySelector("[data-action='import-back']")?.addEventListener("click", () => {
    uiState.importStep = Math.max(1, uiState.importStep - 1);
    renderApp();
  });
  document.querySelector("[data-action='import-next']")?.addEventListener("click", async () => {
    if (uiState.importStep === 1 && !uiState.importPayload) {
      createToast("Upload a valid spreadsheet before continuing.", "danger");
      return;
    }
    if (uiState.importStep === 7) {
      if (!uiState.importPayload.validCount) {
        createToast("There are no valid rows to import.", "danger");
        return;
      }
      uiState.importPayload = await importService.importValidRecords(uiState.importPayload);
    }
    uiState.importStep = uiState.importStep >= 8 ? 1 : uiState.importStep + 1;
    if (uiState.importStep === 1) uiState.importPayload = null;
    renderApp();
  });
  document.querySelector("[data-action='download-import-errors']")?.addEventListener("click", () => {
    const payload = uiState.importPayload;
    downloadCsv("import-errors.csv", [["Error"], ...(payload?.errors || []).map((item) => [item])]);
  });
}

function renderArchived() {
  const sections = [
    ["Cooperators", beneficiaryService.list({ includeArchived: true }).filter((item) => item.archived), "beneficiaries", beneficiaryService.restore],
    ["Employees", employeeService.list({ includeArchived: true }).filter((item) => item.archived), "employees", employeeService.restore],
    ["Payments", collectionService.list({ includeArchived: true }).filter((item) => item.archived), "payments", collectionService.restore],
    ["Receipts", receiptService.list({ includeArchived: true }).filter((item) => item.archived), "receipts", receiptService.restore],
    ["Deferments", defermentService.list({ includeArchived: true }).filter((item) => item.archived), "deferments", defermentService.restore],
    ["Adjustments", adjustmentService.list({ includeArchived: true }).filter((item) => item.archived), "adjustments", adjustmentService.restore],
    ["Documents", documentService.list({ includeArchived: true }).filter((item) => item.archived), "documents", documentService.restore],
    ["Sales Monitoring", salesMonitoringService.list({ includeArchived: true }).filter((item) => item.archived), "salesMonitoring", salesMonitoringService.restore]
  ];
  return `
    ${pageHeader({ title: "Archived Records", eyebrow: "Internal / Archive", description: "Records can be viewed, restored, or permanently deleted.", actions: "" })}
    <section class="list-toolbar">${searchInput("Search archived records")}<label>Type <select data-archive-type><option value="">All</option>${sections.map(([name]) => `<option>${name}</option>`).join("")}</select></label></section>
    <section class="archive-grid">${sections
      .map(([title, records, type]) => `<section class="panel archive-section" data-archive-section="${title}"><div class="panel-head"><h2>${title}</h2><p>${records.length} archived</p></div>${records.length ? records
        .map((item) => `<article data-record-card data-search-text="${escapeHtml(Object.values(item).join(" "))}"><strong>${escapeHtml(item.firmName || item.referenceNumber || item.orNumber || item.type || item.fileName || (item.firstName || item.lastName ? getEmployeeFullName(item) : "") || item.id)}</strong><span>Date archived: ${formatDate(item.updatedAt?.slice(0, 10) || todayIso())}</span><div><button type="button">View record</button><button type="button" data-action="restore-record" data-type="${type}" data-id="${item.id}">Restore</button><button type="button" data-action="delete-record" data-type="${type}" data-id="${item.id}">Delete</button></div></article>`)
        .join("") : emptyState("No archived records", `No archived ${title.toLowerCase()} yet.`)}</section>`)
      .join("")}</section>
  `;
}

const archiveRestoreMap = {
  beneficiaries: beneficiaryService.restore,
  employees: employeeService.restore,
  payments: collectionService.restore,
  receipts: receiptService.restore,
  deferments: defermentService.restore,
  adjustments: adjustmentService.restore,
  documents: documentService.restore,
  salesMonitoring: salesMonitoringService.restore
};

const deleteRecordMap = {
  beneficiaries: beneficiaryService.delete,
  employees: employeeService.delete,
  payments: collectionService.delete,
  receipts: receiptService.delete,
  deferments: defermentService.delete,
  adjustments: adjustmentService.delete,
  documents: documentService.delete,
  salesMonitoring: salesMonitoringService.delete
};

function bindDeleteActions(redirectPath = "") {
  document.querySelectorAll("[data-action='delete-record']").forEach((button) => {
    button.addEventListener("click", async () => {
      const deleteRecord = deleteRecordMap[button.dataset.type];
      if (!deleteRecord) return;
      const confirmed = await confirmAction("Permanently delete this record? This cannot be restored.", {
        title: "Delete permanently?",
        confirmLabel: "Delete",
        type: "danger"
      });
      if (!confirmed) return;
      deleteRecord(button.dataset.id);
      window.__dirtyForm = false;
      createToast("Record deleted.");
      if (redirectPath) navigate(redirectPath);
      else renderApp();
    });
  });
}

function bindArchived() {
  bindSearch(document);
  document.querySelector("[data-archive-type]")?.addEventListener("change", (event) => {
    document.querySelectorAll("[data-archive-section]").forEach((section) => {
      section.hidden = event.target.value && section.dataset.archiveSection !== event.target.value;
    });
  });
  document.querySelectorAll("[data-action='restore-record']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction("Restore this archived record?", {
        title: "Restore record?",
        confirmLabel: "Restore"
      });
      if (!confirmed) return;
      archiveRestoreMap[button.dataset.type](button.dataset.id);
      createToast("Record restored.");
      renderApp();
    });
  });
  bindDeleteActions();
}

function renderSettings() {
  const settings = settingsService.get();
  return `
    ${pageHeader({ title: "Settings", eyebrow: "Internal / System Settings", description: "System and report settings only. No user accounts, roles, passwords, or permissions.", actions: "" })}
    <form class="record-form" data-settings-form>
      ${formSection(
        "Organization and Report Defaults",
        "Used by print headers and exports.",
        field({ label: "Organization name", name: "organizationName", value: settings.organizationName }) +
          textArea({ label: "Office address", name: "officeAddress", value: settings.officeAddress }) +
          field({ label: "Office contact information", name: "officeContact", value: settings.officeContact }) +
          fileUpload({ label: "Logo upload UI", name: "logo" }) +
          field({ label: "Default report heading", name: "defaultReportHeading", value: settings.defaultReportHeading }) +
          selectField({ label: "Currency format", name: "currencyFormat", options: ["Philippine Peso"], value: settings.currencyFormat }) +
          selectField({ label: "Date display format", name: "dateFormat", options: ["MMM DD, YYYY", "YYYY-MM-DD", "DD/MM/YYYY"], value: settings.dateFormat }) +
          field({ label: "Default repayment months", name: "defaultRepaymentMonths", type: "number", value: settings.defaultRepaymentMonths, min: "1" }) +
          field({ label: "Prepared by", name: "preparedBy", value: settings.preparedBy }) +
          field({ label: "Reviewed by", name: "reviewedBy", value: settings.reviewedBy }) +
          field({ label: "Approved by", name: "approvedBy", value: settings.approvedBy }) +
          field({ label: "Default rows per table", name: "defaultRowsPerTable", type: "number", value: settings.defaultRowsPerTable, min: "5" }) +
          selectField({ label: "Theme preference", name: "themePreference", options: ["Light", "High contrast"], value: settings.themePreference }) +
          `<div class="placeholder-box span-2"><strong>Data backup and restore</strong><p>Export a JSON backup from Supabase or restore one into the connected Supabase database.</p><button class="btn btn-secondary" type="button" data-action="backup-data">Backup Data</button><button class="btn btn-secondary" type="button" data-action="choose-restore-file">Restore Data</button><input type="file" data-restore-file accept=".json,application/json" hidden /></div>`
      )}
      <div class="sticky-actions"><button class="btn btn-primary" type="submit">Save Settings</button></div>
    </form>
  `;
}

function bindSettings() {
  const form = document.querySelector("[data-settings-form]");
  bindDirtyForm(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    settingsService.save(readForm(form));
    window.__dirtyForm = false;
    createToast("Settings saved.");
  });
  document.querySelector("[data-action='backup-data']")?.addEventListener("click", () => {
    downloadJson(`dost-is-setup-backup-${todayIso()}.json`, repository.getState());
  });
  const restoreInput = document.querySelector("[data-restore-file]");
  document.querySelector("[data-action='choose-restore-file']")?.addEventListener("click", () => restoreInput?.click());
  restoreInput?.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    try {
      const nextState = JSON.parse(await file.text());
      repository.saveState(nextState);
      window.__dirtyForm = false;
      createToast("Database restored from backup.");
      renderApp();
    } catch (error) {
      console.error(error);
      createToast("Could not restore this backup file.", "danger");
    }
  });
}

function renderNotFound() {
  return `
    ${pageHeader({ title: "Page Not Found", eyebrow: "Internal / Navigation", description: "The requested internal route does not exist.", actions: buttonLink("/", "Return to Dashboard", "dashboard", "primary") })}
    ${emptyState("Invalid internal route", "Use the sidebar or dashboard quick actions to continue.")}
  `;
}

document.body.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (!link) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  navigate(url.hash?.startsWith("#/") ? url.hash.slice(1) : `${url.pathname}${url.search}`);
});

window.addEventListener("hashchange", () => {
  window.__dirtyForm = false;
  renderApp();
});

window.addEventListener("popstate", () => {
  window.__dirtyForm = false;
  renderApp();
});

window.addEventListener("beforeunload", (event) => {
  if (!window.__dirtyForm) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("online", () => document.querySelector("[data-online-state]")?.replaceChildren(document.createTextNode("Online")));
window.addEventListener("offline", () => document.querySelector("[data-online-state]")?.replaceChildren(document.createTextNode("Offline")));

try {
  await repository.init();
  try {
    const result = await dashboardService.archiveEligibleCompletedRefunds({ asOf: todayIso() });
    if (result.archived.length) console.info(`Auto-archived ${result.archived.length} completed SETUP refund record(s).`);
  } catch (error) {
    console.warn("Automatic SETUP refund archive check failed; continuing startup.", error);
  }
  renderApp();
} catch (error) {
  console.error("Application startup failed:", error);
  app.innerHTML = errorState("Database connection failed. Confirm src/supabaseClient.js has the correct Supabase URL and anon key, and that Supabase allows this domain.");
}
