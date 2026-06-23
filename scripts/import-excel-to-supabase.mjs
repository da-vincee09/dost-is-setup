import XLSX from "xlsx";
import { config } from "../server/config.mjs";

const workbookPath = "Ilocos-Sur-Refund-Collection-Files.xlsx";

const supabaseUrl = config.supabaseUrl;
const supabaseKey = config.supabaseKey;
const dryRun = process.argv.includes("--dry-run");

const monthNames = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12]
]);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "").replace(/[₱,\s]/g, "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value, fallbackYear = "") {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw || raw === "-") return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dotted = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotted) {
    let [, m, d, y] = dotted;
    if (y.length === 2) y = Number(y) > 60 ? `19${y}` : `20${y}`;
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const monthYear = raw.match(/^([A-Za-z]+)-?(\d{2,4})$/);
  if (monthYear && monthNames.has(monthYear[1].toLowerCase())) {
    let year = monthYear[2];
    if (year.length === 2) year = Number(year) > 60 ? `19${year}` : `20${year}`;
    return `${year}-${String(monthNames.get(monthYear[1].toLowerCase())).padStart(2, "0")}-01`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getFullYear()).padStart(4, "0")}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  if (fallbackYear && monthNames.has(raw.toLowerCase())) {
    return `${fallbackYear}-${String(monthNames.get(raw.toLowerCase())).padStart(2, "0")}-01`;
  }
  return "";
}

function addMonths(iso, count) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + count, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(Math.min(Number(match[3]), lastDay)).padStart(2, "0")}`;
}

function getRows(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => row.some((cell) => /PROJECT TITLE/i.test(text(cell))) && row.some((cell) => /MONTH/i.test(text(cell))));
}

function detectColumns(rows, headerIndex) {
  const header = rows[headerIndex] || [];
  const sub = rows[headerIndex + 1] || [];
  const month = header.findIndex((cell) => /MONTH/i.test(text(cell)));
  const monthlyRefund = sub.findIndex((cell, index) => index > month && /Refund/i.test(text(cell)));
  const pdcNumber = sub.findIndex((cell) => /PDC\s*#/i.test(text(cell)));
  const pdcAmount = sub.findIndex((cell, index) => index > monthlyRefund && index < pdcNumber && /Amount Paid/i.test(text(cell)));
  const pdcDate = sub.findIndex((cell, index) => index > pdcNumber && /^Date$/i.test(text(cell)));
  const orNumber = sub.findIndex((cell, index) => index > pdcDate && /^Number$/i.test(text(cell)));
  const orAmount = sub.findIndex((cell, index) => index > pdcDate && index < orNumber && /Amount Paid/i.test(text(cell)));
  const orDate = sub.findIndex((cell, index) => index > orNumber && /^Date$/i.test(text(cell)));
  const penalty = header.findIndex((cell) => /Penalty/i.test(text(cell)));
  const remarks = header.findIndex((cell) => /Remarks/i.test(text(cell)));
  return { title: 0, month, monthlyRefund, pdcAmount, pdcNumber, pdcDate, orAmount, orNumber, orDate, penalty, remarks };
}

function extractProfile(rows, sheetName) {
  const flat = rows.flat().map(text).filter(Boolean);
  const spinCell = flat.find((item) => /^SPIN:/i.test(item)) || "";
  const spin = spinCell.replace(/^SPIN:\s*/i, "").trim() || sheetName;
  const releaseCell = flat.find((item) => /Date of fund released:/i.test(item)) || "";
  const releaseDate = isoDate(releaseCell.replace(/Date of fund released:/i, "").trim());
  const pesoCell = flat.find((item) => /(?:₱|Php|PhP|P )\s*[\d,]+/i.test(item)) || "";
  return { spin, releaseDate, amountHint: money(pesoCell), sheetName };
}

function parseSummary(workbook) {
  const rows = getRows(workbook, "SUMMARY");
  const beneficiaries = [];
  for (let index = 5; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const firmName = text(row[0]);
    if (!firmName || /^total/i.test(firmName)) continue;
    const projectYear = Number(text(row[1]).match(/\d{4}/)?.[0] || 0);
    const assistanceAmount = money(row[3]);
    if (!projectYear || !assistanceAmount) continue;
    const repaymentStartDate = isoDate(row[5], projectYear);
    const originalDueDate = isoDate(row[6], projectYear);
    const installments = Number(text(row[4]).replace(/[^\d]/g, "")) || Math.max(1, Math.round(assistanceAmount / Math.max(1, money(row[4]))));
    beneficiaries.push({
      firmName,
      projectYear,
      sourceOfFund: text(row[2]) || "SETUP",
      assistanceAmount,
      projectDurationMonths: installments,
      repaymentStartDate,
      originalDueDate,
      installments,
      monthlyRefundAmount: installments ? Math.round((assistanceAmount / installments + Number.EPSILON) * 100) / 100 : 0
    });
  }
  return beneficiaries;
}

function parseLedger(workbook, sheetName, beneficiary) {
  const rows = getRows(workbook, sheetName);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) return { payments: [], receipts: [], allocations: [], profile: extractProfile(rows, sheetName), skipped: "No ledger header" };
  const cols = detectColumns(rows, headerIndex);
  const profile = extractProfile(rows, sheetName);
  const payments = [];
  const receipts = [];
  const allocations = [];
  let currentYear = beneficiary.projectYear;
  let installment = 0;
  for (let rowIndex = headerIndex + 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const monthText = text(row[cols.month]);
    if (/^\d{4}$/.test(monthText)) {
      currentYear = Number(monthText);
      continue;
    }
    if (!monthNames.has(monthText.toLowerCase())) continue;
    const expected = money(row[cols.monthlyRefund]);
    const paid = money(row[cols.pdcAmount] || row[cols.orAmount]);
    const orPaid = money(row[cols.orAmount]);
    if (expected > 0) installment += 1;
    if (paid <= 0 && orPaid <= 0) continue;
    const paymentDate = isoDate(row[cols.pdcDate], currentYear) || isoDate(row[cols.orDate], currentYear) || `${currentYear}-${String(monthNames.get(monthText.toLowerCase())).padStart(2, "0")}-01`;
    const referenceNumber = text(row[cols.pdcNumber]) || `ledger-row-${beneficiary.id}-${rowIndex + 1}`;
    const method = /cash/i.test(referenceNumber) ? "Cash" : /pmo/i.test(referenceNumber) ? "PMO" : "PDC";
    const paymentId = `pay-${beneficiary.id}-${slug(`${rowIndex + 1}-${referenceNumber}-${paymentDate}`)}`;
    const amount = paid || orPaid;
    payments.push({
      id: paymentId,
      cooperator_id: beneficiary.id,
      project_title: beneficiary.project_title,
      payment_date: paymentDate,
      amount,
      method,
      reference_number: referenceNumber,
      check_date: method === "PDC" ? paymentDate : null,
      bank: "",
      date_received: paymentDate,
      date_deposited: null,
      status: "Received",
      remarks: text(row[cols.remarks]),
      archived: false
    });
    allocations.push({
      payment_id: paymentId,
      cooperator_id: beneficiary.id,
      installment_number: installment || rowIndex - headerIndex - 1,
      amount
    });
    const orNumber = text(row[cols.orNumber]);
    const orDate = isoDate(row[cols.orDate], currentYear);
    if (orNumber && orPaid > 0) {
      receipts.push({
        id: `or-${paymentId}-${slug(orNumber)}-${slug(orDate)}`,
        cooperator_id: beneficiary.id,
        payment_id: paymentId,
        or_number: orNumber,
        or_date: orDate || paymentDate,
        amount: orPaid,
        penalty_amount: money(row[cols.penalty]),
        attachment_name: "",
        remarks: text(row[cols.remarks]),
        archived: false
      });
    }
  }
  return { payments, receipts, allocations, profile };
}

function buildImportPayload() {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const summary = parseSummary(workbook);
  const sheetNames = workbook.SheetNames.filter((name) => name !== "SUMMARY");
  const beneficiaries = [];
  const payments = [];
  const receipts = [];
  const allocations = [];
  const skippedSheets = [];

  for (const [summaryIndex, item] of summary.entries()) {
    const matchingSheet =
      sheetNames[summaryIndex] ||
      sheetNames.find((name) => slug(name).includes(slug(item.firmName).slice(0, 12))) ||
      sheetNames.find((name) => slug(item.firmName).includes(slug(name).replace(/^\d{4}-/, "").slice(0, 10)));
    const sheetName = matchingSheet || `${item.projectYear} ${item.firmName}`;
    const profile = matchingSheet ? extractProfile(getRows(workbook, matchingSheet), matchingSheet) : { spin: `${item.projectYear}-${item.firmName}`, releaseDate: "", amountHint: 0, sheetName };
    const beneficiary = {
      id: `ben-${slug(`${item.projectYear}-${profile.spin || item.firmName}`)}`,
      firm_name: item.firmName,
      proprietor: "",
      address: "",
      municipality: "",
      contact_number: "",
      email: "",
      notes: `Imported from Excel sheet: ${sheetName}`,
      project_title: item.firmName,
      spin: profile.spin || `${item.projectYear}-${item.firmName}`,
      project_year: item.projectYear,
      source_of_fund: item.sourceOfFund,
      officer: "",
      project_status: "Imported",
      assistance_amount: item.assistanceAmount,
      release_date: profile.releaseDate || item.repaymentStartDate,
      project_duration_months: item.projectDurationMonths,
      repayment_start_date: item.repaymentStartDate,
      original_due_date: item.originalDueDate || addMonths(item.repaymentStartDate, item.installments - 1),
      installments: item.installments,
      monthly_refund_amount: item.monthlyRefundAmount,
      technology_transfer_fee: 0,
      option_to_buy_amount: 0,
      other_fees: 0,
      financial_remarks: "Imported from historical Excel workbook",
      status: "Under Review",
      archived: false
    };
    beneficiaries.push(beneficiary);
    if (matchingSheet) {
      const ledger = parseLedger(workbook, matchingSheet, beneficiary);
      payments.push(...ledger.payments);
      receipts.push(...ledger.receipts);
      allocations.push(...ledger.allocations);
      if (ledger.skipped) skippedSheets.push({ sheetName: matchingSheet, reason: ledger.skipped });
    } else {
      skippedSheets.push({ sheetName, reason: "No matching ledger sheet found" });
    }
  }

  return { beneficiaries, payments, receipts, allocations, skippedSheets };
}

async function request(path, options = {}) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY before importing.");
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

async function selectAll(path) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const chunk = await request(path, {
      headers: {
        Range: `${from}-${from + pageSize - 1}`,
        "Range-Unit": "items"
      }
    });
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}

async function existingBeneficiaryIdsBySpin() {
  const rows = await selectAll("/rest/v1/cooperators?select=id,spin");
  return new Map(rows.filter((row) => row.spin).map((row) => [row.spin, row.id]));
}

async function existingPaymentIdsByReference() {
  const rows = await selectAll("/rest/v1/payments?select=id,reference_number");
  return new Map(rows.filter((row) => row.reference_number).map((row) => [row.reference_number, row.id]));
}

async function existingReceiptIdsByOrNumber() {
  const rows = await selectAll("/rest/v1/receipts?select=id,or_number,payment_id");
  return new Map(rows.filter((row) => row.or_number).map((row) => [row.or_number, { id: row.id, paymentId: row.payment_id }]));
}

function alignPayloadIds(payload, idsBySpin, paymentIdsByReference, receiptIdsByOrNumber) {
  const paymentIdMap = new Map();
  const receiptsByOriginalPaymentId = new Map(payload.receipts.map((receipt) => [receipt.payment_id, receipt]));
  const paymentSequenceByBeneficiaryId = new Map();

  for (const beneficiary of payload.beneficiaries) {
    const originalBeneficiaryId = beneficiary.id;
    const beneficiaryId = idsBySpin.get(beneficiary.spin) || originalBeneficiaryId;
    beneficiary.id = beneficiaryId;

    const beneficiaryPayments = payload.payments.filter((payment) => payment.cooperator_id === originalBeneficiaryId);
    beneficiaryPayments.forEach((payment) => {
      const sequence = (paymentSequenceByBeneficiaryId.get(beneficiaryId) || 0) + 1;
      paymentSequenceByBeneficiaryId.set(beneficiaryId, sequence);
      const originalPaymentId = payment.id;
      const receipt = receiptsByOriginalPaymentId.get(originalPaymentId);
      const existingReceipt = receipt ? receiptIdsByOrNumber.get(receipt.or_number) : null;
      const ambiguousReference = /^cash$/i.test(payment.reference_number) || /^ledger-row-/i.test(payment.reference_number);
      if (ambiguousReference && !existingReceipt) payment.reference_number = `${payment.reference_number}-${beneficiaryId}-${sequence}`;
      const paymentId = existingReceipt?.paymentId || (!ambiguousReference ? paymentIdsByReference.get(payment.reference_number) : "") || `pay-${beneficiaryId}-${sequence}`;
      payment.id = paymentId;
      payment.cooperator_id = beneficiaryId;
      paymentIdMap.set(originalPaymentId, { paymentId, beneficiaryId, sequence });

      if (receipt) {
        receipt.id = existingReceipt?.id || `or-${beneficiaryId}-${sequence}`;
        receipt.cooperator_id = beneficiaryId;
        receipt.payment_id = paymentId;
      }
    });
  }

  for (const allocation of payload.allocations) {
    const mapped = paymentIdMap.get(allocation.payment_id);
    if (mapped) {
      allocation.payment_id = mapped.paymentId;
      allocation.cooperator_id = mapped.beneficiaryId;
    }
  }

  payload.beneficiaries = [...new Map(payload.beneficiaries.map((beneficiary) => [beneficiary.id, beneficiary])).values()];
  return payload;
}

function duplicateValues(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function uniquifyDuplicatePaymentReferences(payments) {
  const byReference = payments.reduce((map, payment) => {
    if (!payment.reference_number) return map;
    map.set(payment.reference_number, [...(map.get(payment.reference_number) || []), payment]);
    return map;
  }, new Map());

  for (const [referenceNumber, group] of byReference.entries()) {
    if (group.length <= 1) continue;
    group.forEach((payment, index) => {
      if (index > 0) payment.reference_number = `${referenceNumber}-${payment.cooperator_id}-${index + 1}`;
    });
  }
}

function uniquifyDuplicateReceiptNumbers(receipts) {
  const byNumber = receipts.reduce((map, receipt) => {
    if (!receipt.or_number) return map;
    map.set(receipt.or_number, [...(map.get(receipt.or_number) || []), receipt]);
    return map;
  }, new Map());

  for (const [orNumber, group] of byNumber.entries()) {
    if (group.length <= 1) continue;
    group.forEach((receipt, index) => {
      if (index > 0) receipt.or_number = `${orNumber}-${index + 1}`;
    });
  }
}

async function upsert(table, rows) {
  if (!rows.length) return [];
  const chunkSize = 100;
  const results = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const result = await request(`/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(chunk)
    });
    results.push(...result);
  }
  return results;
}

async function insert(table, rows) {
  if (!rows.length) return [];
  const chunkSize = 100;
  const results = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const result = await request(`/rest/v1/${table}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(chunk)
    });
    results.push(...result);
  }
  return results;
}

async function deletePaymentAllocations(paymentIds) {
  const chunkSize = 75;
  for (let index = 0; index < paymentIds.length; index += chunkSize) {
    const chunk = paymentIds.slice(index, index + chunkSize);
    await request(`/rest/v1/payment_allocations?payment_id=in.(${chunk.map(encodeURIComponent).join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
  }
}

async function main() {
  const payload = buildImportPayload();
  const summary = {
    beneficiaries: payload.beneficiaries.length,
    payments: payload.payments.length,
    receipts: payload.receipts.length,
    allocations: payload.allocations.length,
    skippedSheets: payload.skippedSheets.length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (payload.skippedSheets.length) {
    console.log("Skipped sheets:");
    console.log(JSON.stringify(payload.skippedSheets.slice(0, 20), null, 2));
  }
  if (dryRun) return;
  uniquifyDuplicateReceiptNumbers(payload.receipts);
  uniquifyDuplicatePaymentReferences(payload.payments);
  alignPayloadIds(payload, await existingBeneficiaryIdsBySpin(), await existingPaymentIdsByReference(), await existingReceiptIdsByOrNumber());
  uniquifyDuplicatePaymentReferences(payload.payments);
  const duplicateBeneficiaryIds = duplicateValues(payload.beneficiaries, "id");
  const duplicatePaymentIds = duplicateValues(payload.payments, "id");
  const duplicateReceiptIds = duplicateValues(payload.receipts, "id");
  const duplicateReceiptNumbers = duplicateValues(payload.receipts, "or_number");
  if (duplicateBeneficiaryIds.length || duplicatePaymentIds.length || duplicateReceiptIds.length || duplicateReceiptNumbers.length) {
    throw new Error(
      `Duplicate import keys: ${JSON.stringify({
        beneficiaryIds: duplicateBeneficiaryIds.slice(0, 20),
        paymentIds: duplicatePaymentIds.slice(0, 20),
        receiptIds: duplicateReceiptIds.slice(0, 20),
        receiptNumbers: duplicateReceiptNumbers.slice(0, 20)
      })}`
    );
  }
  const duplicatePaymentReferences = duplicateValues(payload.payments, "reference_number");
  if (duplicatePaymentReferences.length) {
    throw new Error(`Duplicate payment references in import payload: ${JSON.stringify(duplicatePaymentReferences.slice(0, 20))}`);
  }
  await upsert("cooperators", payload.beneficiaries);
  await upsert("payments", payload.payments);
  await deletePaymentAllocations(payload.payments.map((payment) => payment.id));
  await insert("payment_allocations", payload.allocations);
  await upsert("receipts", payload.receipts);
  console.log("Import completed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
