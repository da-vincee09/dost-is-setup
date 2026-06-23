import * as XLSX from "./vendor/xlsx.mjs";

export const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2
});

export const shortDate = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit"
});

export function formatCurrency(value) {
  return peso.format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return "Not set";
  const date = parseIsoDate(value);
  return Number.isNaN(date.getTime()) ? value : shortDate.format(date);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoParts(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1) return null;
  const lastDay = new Date(parts.year, parts.month, 0).getDate();
  if (parts.day > lastDay) return null;
  return parts;
}

function parseIsoDate(isoDate) {
  const parts = parseIsoParts(isoDate);
  if (!parts) return new Date(Number.NaN);
  return new Date(parts.year, parts.month - 1, parts.day);
}

function isoFromParts(year, monthIndex, day) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths(isoDate, count) {
  const parts = parseIsoParts(isoDate);
  if (!parts) return "";
  const target = new Date(parts.year, parts.month - 1 + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoFromParts(target.getFullYear(), target.getMonth(), Math.min(parts.day, lastDay));
}

export function daysBetween(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

export function percent(value, total) {
  if (!total) return 0;
  return clamp((value / total) * 100, 0, 999);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function uid(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function toNumber(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function debounce(fn, wait = 180) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadXlsx(filename, sheetName, rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || "Report");
  XLSX.writeFile(workbook, filename);
}

function pdfEscape(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function pdfPlainText(value) {
  return String(value ?? "")
    .replaceAll("₱", "PHP ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function pdfWrapText(value, width, fontSize, maxLines = 3) {
  const text = pdfPlainText(value) || " ";
  const maxChars = Math.max(5, Math.floor(width / (fontSize * 0.74)));
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const chunks = word.length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, "g")) || [word] : [word];
    for (const chunk of chunks) {
      const next = current ? `${current} ${chunk}` : chunk;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = chunk;
      } else {
        current = next;
      }
      if (lines.length === maxLines) break;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.some((line) => line.length > maxChars)) {
    lines.forEach((line, index) => {
      lines[index] = line.slice(0, maxChars);
    });
  }
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return lines.length ? lines : [" "];
}

function pdfTextAt(x, y, text, fontSize = 8, align = "left") {
  const safeText = pdfEscape(pdfPlainText(text));
  if (align === "center") {
    return `0 0 0 rg BT /F1 ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET`;
  }
  return `0 0 0 rg BT /F1 ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET`;
}

export function downloadPdf(filename, title, rows) {
  const columns = Object.keys(rows[0] || {});
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  const tableWidth = pageWidth - margin * 2;
  const rowFontSize = columns.length > 10 ? 5.7 : columns.length > 8 ? 6.3 : 7.2;
  const headerFontSize = columns.length > 10 ? 5.5 : columns.length > 8 ? 6 : 7;
  const lineHeight = rowFontSize + 2.6;
  const minRowHeight = columns.length > 10 ? 25 : 20;
  const headerRowHeight = columns.length > 10 ? 30 : 24;
  const bottomLimit = margin + 18;
  const weights = columns.map((column) => {
    const headerWeight = pdfPlainText(column).length * 1.35;
    const sampleWeight = rows.slice(0, 30).reduce((max, row) => Math.max(max, pdfPlainText(row[column]).length), 0);
    return Math.max(8, Math.min(28, Math.max(headerWeight, sampleWeight * 0.8)));
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const widths = weights.map((value) => Math.max(42, (value / totalWeight) * tableWidth));
  const widthScale = tableWidth / widths.reduce((sum, value) => sum + value, 0);
  const columnWidths = widths.map((value) => value * widthScale);
  const pages = [];
  let current = [];
  let y = pageHeight - margin;

  const add = (op) => current.push(op);
  const startPage = () => {
    current = [];
    y = pageHeight - margin;
    add("0 0 0 rg 0 0 0 RG");
    add(pdfTextAt(pageWidth / 2 - 80, y, pdfPlainText(title), 13, "center"));
    y -= 16;
    add(pdfTextAt(pageWidth / 2 - 152, y, "DOST IS SETUP PROJECTS - Provincial Science and Technology Office - Ilocos Sur", 8, "center"));
    y -= 14;
    add(pdfTextAt(pageWidth / 2 - 70, y, `Generated ${new Date().toLocaleString("en-PH")}`, 8, "center"));
    y -= 18;
    add(`${margin} ${y.toFixed(2)} ${tableWidth} 0.5 re f`);
    y -= 13;
    drawTableHeader();
  };
  const finishPage = () => {
    add(pdfTextAt(pageWidth - margin - 72, margin - 10, `Page ${pages.length + 1}`, 7));
    pages.push(current.join("\n"));
  };
  const drawTableHeader = () => {
    let x = margin;
    add("0.93 0.95 0.98 rg");
    add(`${margin} ${(y - headerRowHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${headerRowHeight.toFixed(2)} re f`);
    add("0.55 0.61 0.70 RG 0.35 w");
    columns.forEach((column, index) => {
      const width = columnWidths[index];
      add(`${x.toFixed(2)} ${(y - headerRowHeight).toFixed(2)} ${width.toFixed(2)} ${headerRowHeight.toFixed(2)} re S`);
      const lines = pdfWrapText(column, width - 7, headerFontSize, columns.length > 10 ? 3 : 2);
      lines.forEach((line, lineIndex) => add(pdfTextAt(x + 3, y - 9 - lineIndex * (headerFontSize + 2), line.toUpperCase(), headerFontSize)));
      x += width;
    });
    y -= headerRowHeight;
  };
  const drawRow = (row, rowIndex) => {
    const cells = columns.map((column, index) => pdfWrapText(row[column], columnWidths[index] - 7, rowFontSize, columns.length > 10 ? 4 : 3));
    const rowHeight = Math.max(minRowHeight, Math.max(...cells.map((cell) => cell.length)) * lineHeight + 7);
    if (y - rowHeight < bottomLimit) {
      finishPage();
      startPage();
    }
    let x = margin;
    if (rowIndex % 2 === 1) {
      add("0.98 0.99 1 rg");
      add(`${margin} ${(y - rowHeight).toFixed(2)} ${tableWidth.toFixed(2)} ${rowHeight.toFixed(2)} re f`);
    }
    add("0.80 0.84 0.89 RG 0.25 w");
    cells.forEach((cellLines, index) => {
      const width = columnWidths[index];
      add(`${x.toFixed(2)} ${(y - rowHeight).toFixed(2)} ${width.toFixed(2)} ${rowHeight.toFixed(2)} re S`);
      cellLines.forEach((line, lineIndex) => add(pdfTextAt(x + 3, y - 10 - lineIndex * lineHeight, line, rowFontSize)));
      x += width;
    });
    y -= rowHeight;
  };

  startPage();
  if (rows.length && columns.length) {
    rows.forEach((row, index) => drawRow(row, index));
  } else {
    add(pdfTextAt(margin, y - 12, "No report data available.", 10));
  }
  finishPage();

  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages.length} >> endobj`,
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"
  ];
  pages.forEach((content, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`${pageObject} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >> endobj`);
    objects.push(`${contentObject} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function setFieldErrors(form, errors) {
  form.querySelectorAll(".field-error").forEach((node) => {
    node.textContent = "";
  });
  Object.entries(errors).forEach(([name, message]) => {
    const output = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    const field = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (output) output.textContent = message;
    if (field) field.setAttribute("aria-invalid", "true");
  });
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    if (!errors[field.name]) field.removeAttribute("aria-invalid");
  });
  const summary = form.querySelector("[data-error-summary]");
  if (summary) {
    const messages = Object.values(errors);
    summary.hidden = messages.length === 0;
    summary.innerHTML = messages.length
      ? `<strong>Please review the form.</strong><ul>${messages.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
  }
}

export function focusFirstError(form) {
  const invalid = form.querySelector("[aria-invalid='true']");
  if (invalid) invalid.focus();
}

function getToastHost() {
  let host = document.querySelector("[data-global-toast-region]");
  if (host) return host;
  host = document.createElement("div");
  host.className = "toast-region";
  host.dataset.globalToastRegion = "true";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

function createToastLegacy(message, type = "success") {
  const host = getToastHost();
  const item = document.createElement("div");
  const config = {
    success: { title: "Success", icon: "✓" },
    warning: { title: "Needs attention", icon: "!" },
    danger: { title: "Could not save", icon: "!" }
  }[type] || { title: "Notice", icon: "i" };
  item.className = `toast toast-${type}`;
  item.setAttribute("role", type === "danger" ? "alert" : "status");
  item.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${config.icon}</span>
    <span class="toast-copy">
      <strong>${escapeHtml(config.title)}</strong>
      <span>${escapeHtml(message)}</span>
    </span>
    <button class="toast-close" type="button" aria-label="Dismiss notification">×</button>
  `;
  item.querySelector(".toast-close")?.addEventListener("click", () => item.remove());
  host.appendChild(item);
  window.setTimeout(() => item.remove(), type === "danger" ? 7200 : 4600);
}

function toastIconSvg(type) {
  const color = {
    success: "#22c55e",
    warning: "#c81e1e",
    danger: "#c81e1e",
    notice: "#174a82"
  }[type] || "#174a82";
  const path = {
    success: "M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4-9.9 9.9Z",
    warning: "M11 5h2v11h-2V5Zm0 13h2v2h-2v-2Z",
    danger: "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z",
    notice: "M11 10h2v7h-2v-7Zm0-3h2v2h-2V7Z"
  }[type] || "M11 10h2v7h-2v-7Zm0-3h2v2h-2V7Z";
  return `<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="11" fill="${color}"></circle><path fill="#ffffff" d="${path}"></path></svg>`;
}

function toastTitle(type) {
  return {
    success: "Success",
    warning: "Needs attention",
    danger: "Unsuccessful",
    notice: "Notice"
  }[type] || "Notice";
}

function buildToastNode(message, type, { title = toastTitle(type), confirm = false } = {}) {
  const item = document.createElement("div");
  item.className = `toast toast-${type}${confirm ? " toast-confirm" : ""}`;
  item.innerHTML = `
    <span class="toast-icon" aria-hidden="true">
      ${toastIconSvg(type)}
    </span>
    <span class="toast-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </span>
    <button class="toast-close" type="button" aria-label="${confirm ? "Dismiss confirmation" : "Dismiss notification"}">
      <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"></path></svg>
    </button>
    ${confirm ? "" : `<span class="toast-progress" aria-hidden="true"></span>`}
  `;
  return item;
}

function showToastNode(item, type, timeout) {
  if (typeof window !== "undefined" && typeof window.Toastify === "function") {
    const toast = window.Toastify({
      node: item,
      duration: timeout,
      gravity: "bottom",
      position: "right",
      close: false,
      stopOnFocus: true,
      className: `app-toastify toastify-${type}`,
      style: { background: "transparent", boxShadow: "none", padding: "0" },
      escapeMarkup: false
    }).showToast();
    item.querySelector(".toast-close")?.addEventListener("click", () => toast.hideToast());
    return toast;
  }
  const host = getToastHost();
  const dismiss = () => {
    item.classList.add("is-leaving");
    window.setTimeout(() => item.remove(), 180);
  };
  item.querySelector(".toast-close")?.addEventListener("click", dismiss);
  host.appendChild(item);
  window.setTimeout(dismiss, timeout);
  return { hideToast: dismiss };
}

export function createToast(message, type = "success") {
  const normalizedType = type === "error" ? "danger" : type;
  const timeout = normalizedType === "danger" ? 7200 : 4600;
  const item = buildToastNode(message, normalizedType);
  item.style.setProperty("--toast-duration", `${timeout}ms`);
  item.setAttribute("role", normalizedType === "danger" ? "alert" : "status");
  showToastNode(item, normalizedType, timeout);
}

export function createConfirmToast(message, { title = "Please confirm", confirmLabel = "Confirm", cancelLabel = "Cancel", type = "warning" } = {}) {
  const normalizedType = type === "error" ? "danger" : type;
  const item = buildToastNode(message, normalizedType, { title, confirm: true });
  item.setAttribute("role", "alertdialog");
  item.querySelector(".toast-copy")?.insertAdjacentHTML("beforeend", `
    <span class="toast-actions">
      <button class="btn btn-primary" type="button" data-confirm-toast-yes>${escapeHtml(confirmLabel)}</button>
      <button class="btn btn-ghost" type="button" data-confirm-toast-no>${escapeHtml(cancelLabel)}</button>
    </span>
  `);
  const toast = showToastNode(item, normalizedType, 0);
  return new Promise((resolve) => {
    const finish = (value) => {
      toast.hideToast();
      resolve(value);
    };
    item.querySelector("[data-confirm-toast-yes]")?.addEventListener("click", () => finish(true), { once: true });
    item.querySelector("[data-confirm-toast-no]")?.addEventListener("click", () => finish(false), { once: true });
    item.querySelector(".toast-close")?.addEventListener("click", () => finish(false), { once: true });
    item.querySelector("[data-confirm-toast-yes]")?.focus();
  });
}

export function validateEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validatePhone(value) {
  if (!value) return true;
  return /^[0-9+() -]{7,24}$/.test(value);
}

export function generateUuid() {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join("")
    ].join("-");
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isValidDate(value) {
  if (!value) return false;
  const date = parseIsoDate(value);
  return !Number.isNaN(date.getTime());
}

export function dateAfter(end, start) {
  if (!isValidDate(end) || !isValidDate(start)) return false;
  return parseIsoDate(end) >= parseIsoDate(start);
}
