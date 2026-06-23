import { config } from "./config.mjs";
import { emptyState } from "./defaultState.mjs";

const emptyDate = "1900-01-01";

function clone(value) {
  return structuredClone(value);
}

async function request(path, options = {}) {
  if (!config.useSupabase) throw new Error("Supabase is not configured.");
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${message || `Supabase request failed with ${response.status}`} Check Supabase RLS/write permissions. For this admin backend, set SUPABASE_SERVICE_ROLE_KEY in .env so the local API can save related records such as cooperator services.`);
    }
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }
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

function emptyToNull(value) {
  return value || null;
}

function dbDate(value) {
  return value || emptyDate;
}

function uiDate(value = "") {
  return value === emptyDate ? "" : value || "";
}

function uiInstallments(row) {
  const noRefundTerms =
    Number(row.assistance_amount || 0) === 0 &&
    Number(row.monthly_refund_amount || 0) === 0 &&
    uiDate(row.repayment_start_date) === "" &&
    uiDate(row.original_due_date) === "";
  return noRefundTerms ? 0 : Number(row.installments || 0);
}

function dbSpin(record) {
  const value = record.project?.spin?.trim();
  return value || `NO-SPIN-${record.id}`;
}

function uiSpin(value = "") {
  return String(value).startsWith("NO-SPIN-") ? "" : value || "";
}

function stripUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function bool(value) {
  return value === true || value === "true" || value === "Yes";
}

function serviceFromDb(row) {
  return {
    id: row.id,
    category: row.category || "",
    subtype: row.subtype || "",
    dateAvailed: row.date_availed || "",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

const setupPhasePrefix = "[SETUP_PHASE]";

function parseSetupPhaseRemarks(remarks = "") {
  const text = String(remarks || "");
  if (!text.startsWith(setupPhasePrefix)) return { notes: text };
  try {
    const parsed = JSON.parse(text.slice(setupPhasePrefix.length));
    return {
      status: parsed.status || "",
      projectTitle: parsed.projectTitle || "",
      yearAwarded: parsed.yearAwarded || "",
      officer: parsed.officer || "",
      fundAssistance: parsed.fundAssistance || "",
      releaseDate: parsed.releaseDate || "",
      monthlyRefund: parsed.monthlyRefund || "",
      refundStart: parsed.refundStart || parsed.repaymentStartDate || "",
      refundEnd: parsed.refundEnd || parsed.originalDueDate || "",
      numberOfMonths: parsed.numberOfMonths || parsed.installments || "",
      technologyTransferFee: parsed.technologyTransferFee || "",
      optionToBuyAmount: parsed.optionToBuyAmount || "",
      otherFees: parsed.otherFees || "",
      financialRemarks: parsed.financialRemarks || "",
      archived: Boolean(parsed.archived),
      archivedAt: parsed.archivedAt || "",
      notes: parsed.notes || ""
    };
  } catch {
    return { notes: text.replace(setupPhasePrefix, "").trim() };
  }
}

function formatSetupPhaseRemarks(phase = {}) {
  return `${setupPhasePrefix}${JSON.stringify({
    status: phase.status || "",
    projectTitle: phase.projectTitle || "",
    yearAwarded: phase.yearAwarded || "",
    officer: phase.officer || "",
    fundAssistance: phase.fundAssistance || "",
    releaseDate: phase.releaseDate || "",
    monthlyRefund: phase.monthlyRefund || "",
    refundStart: phase.refundStart || "",
    refundEnd: phase.refundEnd || "",
    numberOfMonths: phase.numberOfMonths || "",
    technologyTransferFee: phase.technologyTransferFee || "",
    optionToBuyAmount: phase.optionToBuyAmount || "",
    otherFees: phase.otherFees || "",
    financialRemarks: phase.financialRemarks || "",
    archived: Boolean(phase.archived),
    archivedAt: phase.archivedAt || "",
    notes: phase.notes || ""
  })}`;
}

function serviceToDb(cooperatorId, service, index = 0) {
  return {
    id: service.id || `${cooperatorId}-svc-${index + 1}`,
    cooperator_id: cooperatorId,
    category: service.category || "",
    subtype: service.subtype || "",
    date_availed: emptyToNull(service.dateAvailed),
    remarks: service.remarks || "",
    archived: Boolean(service.archived)
  };
}

function setupPhaseFromDb(row) {
  const phase = {
    status: row.status || "",
    projectTitle: row.project_title || "",
    yearAwarded: row.year_awarded || "",
    officer: row.officer || "",
    fundAssistance: Number(row.fund_assistance || 0),
    releaseDate: uiDate(row.release_date),
    monthlyRefund: Number(row.monthly_refund_amount || 0),
    refundStart: uiDate(row.refund_start_date),
    refundEnd: uiDate(row.refund_end_date),
    numberOfMonths: Number(row.number_of_months || 0),
    technologyTransferFee: Number(row.technology_transfer_fee || 0),
    optionToBuyAmount: Number(row.option_to_buy_amount || 0),
    otherFees: Number(row.other_fees || 0),
    financialRemarks: row.financial_remarks || "",
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || "",
    notes: row.notes || ""
  };
  return {
    id: row.id,
    category: "SETUP",
    subtype: row.phase_label || "",
    dateAvailed: phase.releaseDate,
    remarks: formatSetupPhaseRemarks(phase),
    archived: Boolean(row.archived)
  };
}

function setupPhaseToDb(cooperatorId, service, index = 0) {
  const phase = parseSetupPhaseRemarks(service.remarks);
  return {
    id: service.id || `${cooperatorId}-phase-${index + 1}`,
    cooperator_id: cooperatorId,
    phase_label: service.subtype || `Phase ${index + 1}`,
    status: phase.status || "",
    project_title: phase.projectTitle || "",
    year_awarded: phase.yearAwarded ? Number(phase.yearAwarded) : null,
    officer: phase.officer || "",
    fund_assistance: Number(phase.fundAssistance || 0),
    release_date: emptyToNull(phase.releaseDate || service.dateAvailed),
    monthly_refund_amount: Number(phase.monthlyRefund || 0),
    refund_start_date: emptyToNull(phase.refundStart),
    refund_end_date: emptyToNull(phase.refundEnd),
    number_of_months: Number(phase.numberOfMonths || 0),
    technology_transfer_fee: Number(phase.technologyTransferFee || 0),
    option_to_buy_amount: Number(phase.optionToBuyAmount || 0),
    other_fees: Number(phase.otherFees || 0),
    financial_remarks: phase.financialRemarks || "",
    notes: phase.notes || "",
    archived: Boolean(phase.archived || service.archived),
    archived_at: emptyToNull(phase.archivedAt)
  };
}

function servicesForBeneficiary(cooperatorId, services = [], phases = []) {
  const ordinaryServices = services
    .filter((item) => item.cooperator_id === cooperatorId && !item.archived && item.category !== "SETUP")
    .map(serviceFromDb);
  const phaseServices = phases
    .filter((item) => item.cooperator_id === cooperatorId && !item.archived)
    .map(setupPhaseFromDb);
  if (phaseServices.length) return [...ordinaryServices, ...phaseServices];
  return services
    .filter((item) => item.cooperator_id === cooperatorId && !item.archived)
    .map(serviceFromDb);
}

function beneficiaryFromDb(row, services = [], phases = []) {
  const assets = {
    land: Number(row.asset_land || 0),
    building: Number(row.asset_building || 0),
    equipment: Number(row.asset_equipment || 0),
    revolvingCapital: Number(row.asset_revolving_capital || 0)
  };
  return {
    id: row.id,
    firmName: row.firm_name,
    proprietor: row.proprietor,
    address: row.address || "",
    municipality: row.municipality || "",
    contactNumber: row.contact_number || "",
    email: row.email || "",
    notes: row.notes || "",
    cooperator: {
      name: row.proprietor || "",
      sex: row.cooperator_sex || "",
      birthDate: row.cooperator_birth_date || "",
      isPwd: Boolean(row.cooperator_is_pwd),
      isIndigenousPeople: Boolean(row.cooperator_is_indigenous_people),
      contactNumber: row.contact_number || "",
      email: row.email || ""
    },
    business: {
      firmName: row.firm_name || "",
      completeAddress: row.address || "",
      municipality: row.municipality || "",
      district: "",
      businessType: row.business_type || "",
      businessSector: row.business_sector || "",
      assets
    },
    services: servicesForBeneficiary(row.id, services, phases),
    project: {
      title: row.project_title,
      spin: uiSpin(row.spin),
      projectYear: Number(row.project_year || 0),
      sourceOfFund: row.source_of_fund || "",
      officer: row.officer || "",
      status: row.project_status || ""
    },
    financial: {
      assistanceAmount: Number(row.assistance_amount || 0),
      releaseDate: uiDate(row.release_date),
      projectDurationMonths: Number(row.project_duration_months || 0),
      repaymentStartDate: uiDate(row.repayment_start_date),
      originalDueDate: uiDate(row.original_due_date),
      installments: uiInstallments(row),
      monthlyRefundAmount: Number(row.monthly_refund_amount || 0),
      technologyTransferFee: Number(row.technology_transfer_fee || 0),
      optionToBuyAmount: Number(row.option_to_buy_amount || 0),
      otherFees: Number(row.other_fees || 0),
      remarks: row.financial_remarks || ""
    },
    status: row.status || "Under Review",
    archived: Boolean(row.archived),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function beneficiaryToDb(record) {
  const cooperator = record.cooperator || {};
  const business = record.business || {};
  const assets = business.assets || record.assets || {};
  return {
    id: record.id,
    firm_name: record.firmName,
    proprietor: record.proprietor,
    address: record.address || "",
    municipality: record.municipality || "",
    contact_number: record.contactNumber || "",
    email: record.email || "",
    notes: record.notes || "",
    cooperator_sex: cooperator.sex || "",
    cooperator_birth_date: emptyToNull(cooperator.birthDate || record.birthDate),
    cooperator_is_pwd: bool(cooperator.isPwd ?? record.isPwd),
    cooperator_is_indigenous_people: bool(cooperator.isIndigenousPeople ?? record.isIndigenousPeople),
    business_type: business.businessType || "",
    business_sector: business.businessSector || "",
    asset_land: Number(assets.land || 0),
    asset_building: Number(assets.building || 0),
    asset_equipment: Number(assets.equipment || 0),
    asset_revolving_capital: Number(assets.revolvingCapital || 0),
    project_title: record.project?.title || "",
    spin: dbSpin(record),
    project_year: Number(record.project?.projectYear || new Date().getFullYear()),
    source_of_fund: record.project?.sourceOfFund || "",
    officer: record.project?.officer || "",
    project_status: record.project?.status || "",
    assistance_amount: Number(record.financial?.assistanceAmount || 0),
    release_date: dbDate(record.financial?.releaseDate),
    project_duration_months: Number(record.financial?.projectDurationMonths || 0),
    repayment_start_date: dbDate(record.financial?.repaymentStartDate),
    original_due_date: dbDate(record.financial?.originalDueDate),
    installments: Number(record.financial?.installments || 1),
    monthly_refund_amount: Number(record.financial?.monthlyRefundAmount || 0),
    technology_transfer_fee: Number(record.financial?.technologyTransferFee || 0),
    option_to_buy_amount: Number(record.financial?.optionToBuyAmount || 0),
    other_fees: Number(record.financial?.otherFees || 0),
    financial_remarks: record.financial?.remarks || "",
    status: record.status,
    archived: Boolean(record.archived)
  };
}

function allocationFromDb(row) {
  return {
    beneficiaryId: row.cooperator_id,
    installmentNumber: Number(row.installment_number || 0),
    amount: Number(row.amount || 0)
  };
}

function allocationToDb(paymentId, allocation) {
  return {
    payment_id: paymentId,
    cooperator_id: allocation.beneficiaryId,
    installment_number: Number(allocation.installmentNumber || 0),
    amount: Number(allocation.amount || 0)
  };
}

function paymentFromDb(row, allocations = []) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    projectTitle: row.project_title || "",
    paymentDate: row.payment_date || "",
    amount: Number(row.amount || 0),
    method: row.method || "Cash",
    referenceNumber: row.reference_number || "",
    checkDate: row.check_date || "",
    bank: row.bank || "",
    dateReceived: row.date_received || "",
    dateDeposited: row.date_deposited || "",
    status: row.status || "Received",
    allocations: allocations.filter((item) => item.payment_id === row.id).map(allocationFromDb),
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function paymentToDb(record) {
  return {
    id: record.id,
    cooperator_id: record.beneficiaryId,
    project_title: record.projectTitle || "",
    payment_date: record.paymentDate,
    amount: Number(record.amount || 0),
    method: record.method,
    reference_number: record.referenceNumber || "",
    check_date: emptyToNull(record.checkDate),
    bank: record.bank || "",
    date_received: emptyToNull(record.dateReceived || record.paymentDate),
    date_deposited: emptyToNull(record.dateDeposited),
    status: record.status,
    remarks: record.remarks || "",
    archived: Boolean(record.archived)
  };
}

function receiptFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    paymentId: row.payment_id,
    orNumber: row.or_number,
    orDate: row.or_date || "",
    amount: Number(row.amount || 0),
    penaltyAmount: Number(row.penalty_amount || 0),
    attachmentName: row.attachment_name || "",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function receiptToDb(record) {
  return {
    id: record.id,
    cooperator_id: record.beneficiaryId,
    payment_id: record.paymentId,
    or_number: record.orNumber,
    or_date: record.orDate,
    amount: Number(record.amount || 0),
    penalty_amount: Number(record.penaltyAmount || 0),
    attachment_name: record.attachmentName || "",
    remarks: record.remarks || "",
    archived: Boolean(record.archived)
  };
}

function defermentFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    requestDate: row.request_date || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    months: Number(row.months || 0),
    reason: row.reason || "",
    approvalDate: row.approval_date || "",
    approvedBy: row.approved_by || "",
    status: row.status || "Pending Documentation",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function defermentToDb(record) {
  return {
    id: record.id,
    cooperator_id: record.beneficiaryId,
    request_date: record.requestDate,
    start_date: record.startDate,
    end_date: record.endDate,
    months: Number(record.months || 0),
    reason: record.reason,
    approval_date: emptyToNull(record.approvalDate),
    approved_by: record.approvedBy || "",
    status: record.status,
    remarks: record.remarks || "",
    archived: Boolean(record.archived)
  };
}

function adjustmentFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    type: row.type,
    effectiveDate: row.effective_date || "",
    amount: Number(row.amount || 0),
    previousValue: row.previous_value || "",
    newValue: row.new_value || "",
    reason: row.reason || "",
    approvedBy: row.approved_by || "",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function adjustmentToDb(record) {
  return {
    id: record.id,
    cooperator_id: record.beneficiaryId,
    type: record.type,
    effective_date: record.effectiveDate,
    amount: Number(record.amount || 0),
    previous_value: record.previousValue || "",
    new_value: record.newValue || "",
    reason: record.reason,
    approved_by: record.approvedBy || "",
    remarks: record.remarks || "",
    archived: Boolean(record.archived)
  };
}

function documentFromDb(row) {
  return {
    id: row.id,
    category: row.category,
    beneficiaryId: row.cooperator_id || "",
    projectTitle: row.project_title || "",
    relatedTransaction: row.related_transaction || "",
    documentDate: row.document_date || "",
    fileName: row.file_name || "",
    fileSize: Number(row.file_size || 0),
    fileType: row.file_type || "",
    storagePath: row.storage_path || "",
    publicUrl: row.storage_path ? `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseDocumentBucket}/${encodeURIComponent(row.storage_path).replaceAll("%2F", "/")}` : "",
    description: row.description || "",
    archived: Boolean(row.archived)
  };
}

function documentToDb(record) {
  return {
    id: record.id,
    category: record.category,
    cooperator_id: emptyToNull(record.beneficiaryId),
    project_title: record.projectTitle || "",
    related_transaction: record.relatedTransaction || "",
    document_date: record.documentDate,
    file_name: record.fileName,
    file_size: Number(record.fileSize || 0),
    file_type: record.fileType || "application/pdf",
    storage_path: record.storagePath || null,
    description: record.description || "",
    archived: Boolean(record.archived)
  };
}

function settingsFromDb(row) {
  if (!row) return clone(emptyState.settings);
  return {
    organizationName: row.organization_name || "",
    officeAddress: row.office_address || "",
    officeContact: row.office_contact || "",
    defaultReportHeading: row.default_report_heading || "",
    currencyFormat: row.currency_format || "Philippine Peso",
    dateFormat: row.date_format || "MMM DD, YYYY",
    defaultRepaymentMonths: Number(row.default_repayment_months || 36),
    preparedBy: row.prepared_by || "",
    reviewedBy: row.reviewed_by || "",
    approvedBy: row.approved_by || "",
    defaultRowsPerTable: Number(row.default_rows_per_table || 10),
    themePreference: row.theme_preference || "Light"
  };
}

function settingsToDb(record) {
  return {
    id: 1,
    organization_name: record.organizationName || "",
    office_address: record.officeAddress || "",
    office_contact: record.officeContact || "",
    default_report_heading: record.defaultReportHeading || "",
    currency_format: record.currencyFormat || "Philippine Peso",
    date_format: record.dateFormat || "MMM DD, YYYY",
    default_repayment_months: Number(record.defaultRepaymentMonths || 36),
    prepared_by: record.preparedBy || "",
    reviewed_by: record.reviewedBy || "",
    approved_by: record.approvedBy || "",
    default_rows_per_table: Number(record.defaultRowsPerTable || 10),
    theme_preference: record.themePreference || "Light"
  };
}

function activityFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id || "",
    action: row.action,
    timestamp: row.created_at
  };
}

function activityToDb(record) {
  return {
    id: record.id,
    cooperator_id: emptyToNull(record.beneficiaryId),
    action: record.action
  };
}

const adapters = {
  beneficiaries: { table: "cooperators", fromDb: beneficiaryFromDb, toDb: beneficiaryToDb },
  payments: { table: "payments", fromDb: paymentFromDb, toDb: paymentToDb },
  receipts: { table: "receipts", fromDb: receiptFromDb, toDb: receiptToDb },
  deferments: { table: "deferments", fromDb: defermentFromDb, toDb: defermentToDb },
  adjustments: { table: "account_adjustments", fromDb: adjustmentFromDb, toDb: adjustmentToDb },
  documents: { table: "documents", fromDb: documentFromDb, toDb: documentToDb },
  activity: { table: "activity_log", fromDb: activityFromDb, toDb: activityToDb }
};

export function isSupabaseConfigured() {
  return config.useSupabase;
}

export async function readSupabaseState() {
  const [beneficiaries, services, setupPhases, payments, allocations, receipts, deferments, adjustments, documents, settings, activity] = await Promise.all([
    selectAll("/rest/v1/cooperators?select=*&order=created_at.desc"),
    selectAll("/rest/v1/cooperator_services?select=*"),
    selectAll("/rest/v1/cooperator_setup_phases?select=*&order=phase_label.asc"),
    selectAll("/rest/v1/payments?select=*&order=created_at.desc"),
    selectAll("/rest/v1/payment_allocations?select=*"),
    selectAll("/rest/v1/receipts?select=*&order=created_at.desc"),
    selectAll("/rest/v1/deferments?select=*&order=created_at.desc"),
    selectAll("/rest/v1/account_adjustments?select=*&order=created_at.desc"),
    selectAll("/rest/v1/documents?select=*&order=created_at.desc"),
    request("/rest/v1/system_settings?select=*&id=eq.1&limit=1"),
    request("/rest/v1/activity_log?select=*&order=created_at.desc&limit=100")
  ]);
  return {
    beneficiaries: beneficiaries.map((beneficiary) => beneficiaryFromDb(beneficiary, services, setupPhases)),
    payments: payments.map((payment) => paymentFromDb(payment, allocations)),
    receipts: receipts.map(receiptFromDb),
    deferments: deferments.map(defermentFromDb),
    adjustments: adjustments.map(adjustmentFromDb),
    documents: documents.map(documentFromDb),
    settings: settingsFromDb(settings[0]),
    activity: activity.map(activityFromDb)
  };
}

export async function upsertSupabaseRecord(collection, records) {
  const adapter = adapters[collection];
  if (!adapter) return [];
  const source = Array.isArray(records) ? records : [records];
  const existingIds = new Set();
  if (collection === "beneficiaries") {
    for (const record of source) {
      const existing = await request(`/rest/v1/cooperators?select=id&id=eq.${encodeURIComponent(record.id)}&limit=1`);
      if (existing.length) existingIds.add(record.id);
    }
  }
  const rows = source.map((record) => stripUndefined(adapter.toDb(record)));
  const result = await request(`/rest/v1/${adapter.table}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
  if (collection === "payments") {
    for (const record of source) {
      await request(`/rest/v1/payment_allocations?payment_id=eq.${encodeURIComponent(record.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      const allocations = (record.allocations || []).map((allocation) => allocationToDb(record.id, allocation));
      if (allocations.length) {
        await request("/rest/v1/payment_allocations", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(allocations)
        });
      }
    }
    return result.map((row) => {
      const original = source.find((record) => record.id === row.id);
      return paymentFromDb(row, (original?.allocations || []).map((allocation) => ({ payment_id: row.id, ...allocationToDb(row.id, allocation) })));
    });
  }
  if (collection === "beneficiaries") {
    try {
      for (const record of source) {
        await request(`/rest/v1/cooperator_services?cooperator_id=eq.${encodeURIComponent(record.id)}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" }
        });
        const services = (record.services || [])
          .filter((service) => service.category)
          .map((service, index) => serviceToDb(record.id, service, index));
        if (services.length) {
          await request("/rest/v1/cooperator_services", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(services)
          });
        }
        await request(`/rest/v1/cooperator_setup_phases?cooperator_id=eq.${encodeURIComponent(record.id)}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" }
        });
        const setupPhases = (record.services || [])
          .filter((service) => service.category === "SETUP")
          .map((service, index) => setupPhaseToDb(record.id, service, index));
        if (setupPhases.length) {
          await request("/rest/v1/cooperator_setup_phases", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(setupPhases)
          });
        }
      }
    } catch (error) {
      for (const record of source) {
        if (!existingIds.has(record.id)) {
          await request(`/rest/v1/cooperators?id=eq.${encodeURIComponent(record.id)}`, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
          }).catch(() => {});
        }
      }
      throw error;
    }
    return result.map((row) => {
      const original = source.find((record) => record.id === row.id);
      const services = (original?.services || []).map((service, index) => serviceToDb(row.id, service, index));
      const setupPhases = (original?.services || []).filter((service) => service.category === "SETUP").map((service, index) => setupPhaseToDb(row.id, service, index));
      return beneficiaryFromDb(row, services, setupPhases);
    });
  }
  return result.map(adapter.fromDb);
}

export async function patchSupabaseRecord(collection, id, patch) {
  const adapter = adapters[collection];
  if (!adapter) return null;
  const rows = await request(`/rest/v1/${adapter.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(stripUndefined(adapter.toDb({ id, ...patch })))
  });
  return rows[0] ? adapter.fromDb(rows[0]) : null;
}

export async function deleteSupabaseRecord(collection, id) {
  const adapter = adapters[collection];
  if (!adapter) return;
  if (collection === "beneficiaries") {
    await request(`/rest/v1/receipts?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/payment_allocations?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/payments?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/deferments?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/account_adjustments?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/documents?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/cooperator_services?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/cooperator_setup_phases?cooperator_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  if (collection === "payments") {
    await request(`/rest/v1/receipts?payment_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await request(`/rest/v1/payment_allocations?payment_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  await request(`/rest/v1/${adapter.table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

export async function saveSupabaseSettings(settings) {
  const rows = await request("/rest/v1/system_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([settingsToDb(settings)])
  });
  return settingsFromDb(rows[0]);
}
