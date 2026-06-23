import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { collectionNames } from "./defaultState.mjs";
import { uploadDir } from "./db.mjs";
import { serviceCategories, serviceSubtypes, setupProjectStatuses } from "../src/referenceData.js";
import { accountStatuses, paymentStatuses } from "../src/status.js";
import {
  deleteSupabaseRecord,
  isSupabaseConfigured,
  readSupabaseState,
  saveSupabaseSettings,
  upsertSupabaseRecord
} from "./supabaseStore.mjs";

const apiHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apikey,Prefer",
  "Access-Control-Max-Age": "86400"
};

const jsonHeaders = { ...apiHeaders, "Content-Type": "application/json; charset=utf-8" };

function sendJson(response, status, payload) {
  response.writeHead(status, jsonHeaders);
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, apiHeaders);
  response.end();
}

function notFound(response) {
  sendJson(response, 404, { error: "Route not found." });
}

function badRequest(response, message) {
  sendJson(response, 400, { error: message });
}

function requireSupabase() {
  if (isSupabaseConfigured()) return;
  throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env.");
}

async function readState() {
  requireSupabase();
  return readSupabaseState();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function requireCollection(name, response) {
  if (collectionNames.has(name)) return true;
  badRequest(response, `Unknown collection: ${name}`);
  return false;
}

function isValidIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setupPhaseInstallmentMax(beneficiary, projectTitle = "") {
  const prefix = "[SETUP_PHASE]";
  const setupServices = (beneficiary.services || []).filter((service) => service.category === "SETUP");
  const phaseRows = setupServices.map((service, index) => {
    let meta = {};
    const remarks = String(service.remarks || "");
    if (remarks.startsWith(prefix)) {
      try {
        meta = JSON.parse(remarks.slice(prefix.length));
      } catch {
        meta = {};
      }
    }
    const phase = service.subtype || `Phase ${index + 1}`;
    const title = meta.projectTitle || beneficiary.setup?.projectTitle || beneficiary.project?.title || "SETUP Project";
    const key = `${title} / ${phase}`;
    return {
      key,
      installments: Number(meta.numberOfMonths || meta.installments || (index === 0 ? beneficiary.financial?.installments : 0) || 0)
    };
  });
  const selected = phaseRows.find((row) => row.key === projectTitle);
  if (selected?.installments) return selected.installments;
  return Math.max(Number(beneficiary.financial?.installments || 0), ...phaseRows.map((row) => row.installments || 0));
}

function hasValidOptionalDate(value) {
  return !value || isValidIsoDate(value);
}

function hasValidStatus(value, allowed) {
  return !value || allowed.includes(value);
}

function validateServices(services = []) {
  if (!Array.isArray(services)) return "Services availed must be an array.";
  for (const [index, service] of services.entries()) {
    if (!service?.category) return `Service ${index + 1} category is required.`;
    if (!serviceCategories.includes(service.category)) return `Service ${index + 1} category is invalid.`;
    const subtypes = serviceSubtypes[service.category] || [];
    if (subtypes.length && !subtypes.includes(service.subtype)) return `Service ${index + 1} subtype is invalid.`;
    if (!subtypes.length && service.subtype && service.category !== "SETUP") return `Service ${index + 1} does not support subtypes.`;
    if (service.dateAvailed && !isValidIsoDate(service.dateAvailed)) return `Service ${index + 1} date is invalid.`;
  }
  return "";
}

function isCreditedPayment(payment) {
  return !payment.archived && !["Pending", "Returned", "Replaced", "Cancelled"].includes(payment.status);
}

function adjustmentEffect(adjustment) {
  if (adjustment.archived) return 0;
  if (["Added Fee", "Penalty Adjustment"].includes(adjustment.type)) return money(adjustment.amount);
  if (["Waived Amount", "Write-off", "Equipment Pull-out", "Terminated Project", "Withdrawn Project"].includes(adjustment.type)) return -money(adjustment.amount);
  return 0;
}

function totalRepayable(beneficiary, state) {
  const base =
    money(beneficiary.financial?.assistanceAmount) +
    money(beneficiary.financial?.technologyTransferFee) +
    money(beneficiary.financial?.optionToBuyAmount) +
    money(beneficiary.financial?.otherFees);
  const adjustments = state.adjustments
    .filter((item) => item.beneficiaryId === beneficiary.id)
    .reduce((sum, item) => sum + adjustmentEffect(item), 0);
  return Math.max(0, Math.round((base + adjustments + Number.EPSILON) * 100) / 100);
}

function existingPaidAmount(state, paymentRecord) {
  return state.payments
    .filter((payment) => payment.id !== paymentRecord.id && payment.beneficiaryId === paymentRecord.beneficiaryId && isCreditedPayment(payment))
    .reduce((sum, payment) => sum + money(payment.amount), 0);
}

export function validateRecord(collection, record, state) {
  if (!record?.id) return "Every record must include an id.";
  if (collection === "beneficiaries") {
    const hasRefundTerms =
      money(record.financial?.assistanceAmount) > 0 ||
      money(record.financial?.monthlyRefundAmount) > 0 ||
      Number(record.financial?.installments || 0) > 0 ||
      Boolean(record.financial?.repaymentStartDate || record.financial?.originalDueDate);
    if (!record.firmName?.trim()) return "Beneficiary name is required.";
    if (!record.proprietor?.trim()) return "Proprietor or representative is required.";
    if (!record.municipality?.trim()) return "Municipality is required.";
    const serviceError = validateServices(record.services || []);
    if (serviceError) return serviceError;
    if (!hasValidStatus(record.status, accountStatuses)) return "Account status is invalid.";
    if (!hasValidStatus(record.project?.status, setupProjectStatuses)) return "Project status is invalid.";
    if (hasRefundTerms && !record.project?.title?.trim()) return "Project title is required for refund accounts.";
    if (record.project?.spin?.trim() && state.beneficiaries.some((item) => item.id !== record.id && item.project?.spin === record.project.spin)) return "SPIN or project number must be unique.";
    if (money(record.financial?.assistanceAmount) < 0) return "Assistance amount cannot be negative.";
    if (money(record.financial?.monthlyRefundAmount) < 0) return "Monthly refund amount cannot be negative.";
    if (!hasValidOptionalDate(record.financial?.releaseDate)) return "Release date must be a valid ISO date.";
    if (hasRefundTerms && Number(record.financial?.installments || 0) <= 0) return "Installments must be greater than zero.";
    if (hasRefundTerms && (!isValidIsoDate(record.financial?.repaymentStartDate) || !isValidIsoDate(record.financial?.originalDueDate))) return "Repayment dates must be valid ISO dates.";
  }
  if (collection === "payments") {
    const beneficiary = state.beneficiaries.find((item) => item.id === record.beneficiaryId);
    if (!beneficiary) return "Payment beneficiary does not exist.";
    if (!isValidIsoDate(record.paymentDate)) return "Payment date must be a valid ISO date.";
    if (money(record.amount) <= 0) return "Payment amount must be greater than zero.";
    if (!record.method) return "Payment method is required.";
    if (!paymentStatuses.includes(record.status)) return "Payment status is invalid.";
    if (!hasValidOptionalDate(record.checkDate) || !hasValidOptionalDate(record.dateReceived) || !hasValidOptionalDate(record.dateDeposited)) return "Payment secondary dates must be valid ISO dates.";
    if (record.referenceNumber && state.payments.some((item) => item.id !== record.id && item.referenceNumber === record.referenceNumber)) return "Payment reference must be unique.";
    const allocations = Array.isArray(record.allocations) ? record.allocations : [];
    const allocated = allocations.reduce((sum, item) => sum + money(item.amount), 0);
    if (!allocations.length) return "Payment must include at least one allocation.";
    if (Math.abs(allocated - money(record.amount)) > 0.01) return "Payment allocations must equal payment amount.";
    if (allocations.some((item) => item.beneficiaryId !== record.beneficiaryId || Number(item.installmentNumber || 0) <= 0 || money(item.amount) <= 0)) return "Payment allocations are invalid.";
    const remainingBalance = totalRepayable(beneficiary, state) - existingPaidAmount(state, record);
    if (money(record.amount) - remainingBalance > 0.01) return "Amount paid cannot exceed the total remaining balance.";
    const allocationByInstallment = allocations.reduce((map, allocation) => {
      const installmentNumber = Number(allocation.installmentNumber);
      map.set(installmentNumber, (map.get(installmentNumber) || 0) + money(allocation.amount));
      return map;
    }, new Map());
    const maxInstallment = setupPhaseInstallmentMax(beneficiary, record.projectTitle);
    for (const [installmentNumber, amount] of allocationByInstallment) {
      if (maxInstallment && installmentNumber > maxInstallment) return "Payment allocations must reference valid installments.";
    }
  }
  if (collection === "receipts") {
    const payment = state.payments.find((item) => item.id === record.paymentId);
    if (!payment) return "Receipt payment does not exist.";
    if (!isCreditedPayment(payment)) return "Receipt payment is not eligible for an official receipt.";
    if (payment.beneficiaryId !== record.beneficiaryId) return "Receipt beneficiary must match payment beneficiary.";
    if (!record.orNumber?.trim()) return "Official receipt number is required.";
    if (state.receipts.some((item) => item.id !== record.id && item.orNumber === record.orNumber)) return "Official receipt number must be unique.";
    if (!isValidIsoDate(record.orDate)) return "Official receipt date must be a valid ISO date.";
    if (record.orDate < payment.paymentDate) return "Official receipt date cannot be earlier than payment date.";
    if (money(record.amount) <= 0) return "Official receipt amount must be greater than zero.";
    if (state.receipts.some((item) => item.id !== record.id && item.paymentId === record.paymentId)) return "Payment already has an official receipt.";
  }
  if (collection === "deferments") {
    if (!state.beneficiaries.some((item) => item.id === record.beneficiaryId)) return "Deferment beneficiary does not exist.";
    if (!isValidIsoDate(record.requestDate) || !isValidIsoDate(record.startDate) || !isValidIsoDate(record.endDate)) return "Deferment dates must be valid ISO dates.";
    if (!hasValidOptionalDate(record.approvalDate)) return "Deferment approval date must be a valid ISO date.";
    if (record.endDate < record.startDate) return "Deferment end date must be after start date.";
    if (Number(record.months || 0) <= 0) return "Deferred months must be greater than zero.";
    if (!record.reason?.trim()) return "Deferment reason is required.";
  }
  if (collection === "adjustments") {
    if (!state.beneficiaries.some((item) => item.id === record.beneficiaryId)) return "Adjustment beneficiary does not exist.";
    if (!record.type) return "Adjustment type is required.";
    if (!["Compromise Agreement", "Revised Repayment Terms", "Added Fee", "Penalty Adjustment", "Waived Amount", "Equipment Pull-out", "Terminated Project", "Withdrawn Project", "Write-off", "Manual Correction"].includes(record.type)) return "Adjustment type is invalid.";
    if (!isValidIsoDate(record.effectiveDate)) return "Adjustment effective date must be a valid ISO date.";
    if (money(record.amount) < 0) return "Adjustment amount cannot be negative.";
    if (!record.reason?.trim()) return "Adjustment reason is required.";
  }
  if (collection === "documents") {
    if (!record.category) return "Document category is required.";
    if (record.beneficiaryId && !state.beneficiaries.some((item) => item.id === record.beneficiaryId)) return "Document beneficiary does not exist.";
    if (!isValidIsoDate(record.documentDate)) return "Document date must be a valid ISO date.";
    if (!record.fileName?.trim()) return "Document file name is required.";
    if (money(record.fileSize) < 0) return "Document file size cannot be negative.";
  }
  return "";
}

function validateIncoming(collection, incoming, state) {
  for (const record of incoming) {
    const error = validateRecord(collection, record, state);
    if (error) return error;
  }
  return "";
}

function safeUploadPath(storagePath) {
  const normalized = normalize(storagePath).replace(/^(\.\.[/\\])+/, "");
  const full = resolve(join(uploadDir, normalized));
  const uploadRoot = resolve(uploadDir);
  if (!full.startsWith(uploadRoot)) throw new Error("Invalid upload path.");
  return full;
}

function publicDocumentUrl(storagePath) {
  return storagePath ? `/uploads/${encodeURI(storagePath).replaceAll("%2F", "/")}` : "";
}

async function handleUpload(request, response) {
  const url = new URL(request.url, "http://localhost");
  const fileName = url.searchParams.get("fileName") || "document";
  const beneficiaryId = url.searchParams.get("beneficiaryId") || "unassigned";
  const recordId = url.searchParams.get("recordId") || createHash("sha256").update(`${Date.now()}-${fileName}`).digest("hex").slice(0, 16);
  const safeName = `${recordId}-${fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "") || "document"}`;
  const storagePath = `${beneficiaryId}/${safeName}`;
  const fullPath = safeUploadPath(storagePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, await readBody(request));
  sendJson(response, 201, { storagePath, publicUrl: publicDocumentUrl(storagePath) });
}

export async function handleApi(request, response) {
  try {
    if (request.method === "OPTIONS") {
      sendNoContent(response);
      return true;
    }

    const url = new URL(request.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).slice(1);
    const [resource, id] = parts;

    if (request.method === "GET" && resource === "health") {
      sendJson(response, isSupabaseConfigured() ? 200 : 503, {
        ok: isSupabaseConfigured(),
        backend: isSupabaseConfigured() ? "supabase" : "unconfigured",
        error: isSupabaseConfigured() ? "" : "Supabase is not configured."
      });
      return true;
    }

    if (request.method === "GET" && resource === "state") {
      sendJson(response, 200, await readState());
      return true;
    }

    if (request.method === "PUT" && resource === "state") {
      requireSupabase();
      const state = await readJson(request);
      for (const collection of ["beneficiaries", "payments", "receipts", "deferments", "adjustments", "documents", "activity"]) {
        if (Array.isArray(state[collection]) && state[collection].length) await upsertSupabaseRecord(collection, state[collection]);
      }
      if (state.settings) await saveSupabaseSettings(state.settings);
      sendJson(response, 200, await readSupabaseState());
      return true;
    }

    if (request.method === "POST" && resource === "documents" && id === "upload") {
      await handleUpload(request, response);
      return true;
    }

    if (request.method === "PUT" && resource === "settings") {
      requireSupabase();
      const settings = await readJson(request);
      const current = await readSupabaseState();
      sendJson(response, 200, await saveSupabaseSettings({ ...current.settings, ...settings }));
      return true;
    }

    if (!resource || !requireCollection(resource, response)) return true;

    if (request.method === "GET" && !id) {
      sendJson(response, 200, (await readState())[resource]);
      return true;
    }

    if (request.method === "GET" && id) {
      const record = (await readState())[resource].find((item) => item.id === id);
      if (!record) notFound(response);
      else sendJson(response, 200, record);
      return true;
    }

    if (request.method === "POST" && !id) {
      const payload = await readJson(request);
      const incoming = Array.isArray(payload) ? payload : [payload];
      const current = await readState();
      const validationError = validateIncoming(resource, incoming, current);
      if (validationError) {
        badRequest(response, validationError);
        return true;
      }
      sendJson(response, 200, await upsertSupabaseRecord(resource, incoming));
      return true;
    }

    if (request.method === "PATCH" && id) {
      const patch = await readJson(request);
      const current = await readSupabaseState();
      const existing = current[resource].find((item) => item.id === id);
      if (!existing) {
        notFound(response);
        return true;
      }
      const merged = { ...existing, ...patch };
      const validationError = validateRecord(resource, merged, current);
      if (validationError) {
        badRequest(response, validationError);
        return true;
      }
      const [saved] = await upsertSupabaseRecord(resource, merged);
      sendJson(response, 200, saved);
      return true;
    }

    if (request.method === "DELETE" && id) {
      const current = await readSupabaseState();
      const existing = current[resource].find((item) => item.id === id);
      if (!existing) {
        notFound(response);
        return true;
      }
      await deleteSupabaseRecord(resource, id);
      if (resource === "documents" && existing.storagePath) {
        rmSync(safeUploadPath(existing.storagePath), { force: true });
      }
      sendNoContent(response);
      return true;
    }

    notFound(response);
    return true;
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected API error." });
    return true;
  }
}
