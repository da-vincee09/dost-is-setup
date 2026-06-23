import { defaultSettings } from "./referenceData.js";
import { supabaseRest, supabaseConfig } from "./supabaseClient.js";
import { generateUuid } from "./utils.js";

const emptyDate = "1900-01-01";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function uuidOrNew(value) {
  return isUuid(value) ? value : generateUuid();
}

function uuidOrNull(value) {
  return isUuid(value) ? value : null;
}

function serviceToDb(cooperatorId, service, index = 0) {
  return {
    id: uuidOrNew(service.id || `${cooperatorId}-svc-${index + 1}`),
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
    fundAssistance: n(row.fund_assistance),
    releaseDate: uiDate(row.release_date),
    monthlyRefund: n(row.monthly_refund_amount),
    refundStart: uiDate(row.refund_start_date),
    refundEnd: uiDate(row.refund_end_date),
    numberOfMonths: n(row.number_of_months),
    technologyTransferFee: n(row.technology_transfer_fee),
    optionToBuyAmount: n(row.option_to_buy_amount),
    otherFees: n(row.other_fees),
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
    id: uuidOrNew(service.id || `${cooperatorId}-phase-${index + 1}`),
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
    land: n(row.asset_land),
    building: n(row.asset_building),
    equipment: n(row.asset_equipment),
    revolvingCapital: n(row.asset_revolving_capital)
  };
  return {
    id: row.id,
    firmName: row.firm_name || "",
    proprietor: row.proprietor || "",
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
      title: row.project_title || "",
      spin: uiSpin(row.spin),
      projectYear: n(row.project_year),
      sourceOfFund: row.source_of_fund || "",
      officer: row.officer || "",
      status: row.project_status || ""
    },
    financial: {
      assistanceAmount: n(row.assistance_amount),
      releaseDate: uiDate(row.release_date),
      projectDurationMonths: n(row.project_duration_months),
      repaymentStartDate: uiDate(row.repayment_start_date),
      originalDueDate: uiDate(row.original_due_date),
      installments: uiInstallments(row),
      monthlyRefundAmount: n(row.monthly_refund_amount),
      technologyTransferFee: n(row.technology_transfer_fee),
      optionToBuyAmount: n(row.option_to_buy_amount),
      otherFees: n(row.other_fees),
      remarks: row.financial_remarks || ""
    },
    status: row.status || "Under Review",
    archived: Boolean(row.archived),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function paymentFromDb(row, allocations) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    projectTitle: row.project_title || "",
    paymentDate: row.payment_date || "",
    amount: n(row.amount),
    method: row.method || "Cash",
    referenceNumber: row.reference_number || "",
    checkDate: row.check_date || "",
    bank: row.bank || "",
    dateReceived: row.date_received || "",
    dateDeposited: row.date_deposited || "",
    status: row.status || "Received",
    allocations: allocations
      .filter((item) => item.payment_id === row.id)
      .map((item) => ({
        beneficiaryId: item.cooperator_id,
        installmentNumber: n(item.installment_number),
        amount: n(item.amount)
      })),
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function receiptFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    paymentId: row.payment_id,
    orNumber: row.or_number || "",
    orDate: row.or_date || "",
    amount: n(row.amount),
    penaltyAmount: n(row.penalty_amount),
    attachmentName: row.attachment_name || "",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function defermentFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    requestDate: row.request_date || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    months: n(row.months),
    reason: row.reason || "",
    approvalDate: row.approval_date || "",
    approvedBy: row.approved_by || "",
    status: row.status || "Pending Documentation",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function adjustmentFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id,
    type: row.type || "",
    effectiveDate: row.effective_date || "",
    amount: n(row.amount),
    previousValue: row.previous_value || "",
    newValue: row.new_value || "",
    reason: row.reason || "",
    approvedBy: row.approved_by || "",
    remarks: row.remarks || "",
    archived: Boolean(row.archived)
  };
}

function documentFromDb(row) {
  const storagePath = row.storage_path || "";
  return {
    id: row.id,
    category: row.category || "",
    beneficiaryId: row.cooperator_id || "",
    projectTitle: row.project_title || "",
    relatedTransaction: row.related_transaction || "",
    documentDate: row.document_date || "",
    fileName: row.file_name || "",
    fileSize: n(row.file_size),
    fileType: row.file_type || "",
    storagePath,
    publicUrl: storagePath ? `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.documentBucket}/${encodeURIComponent(storagePath).replaceAll("%2F", "/")}` : "",
    description: row.description || "",
    archived: Boolean(row.archived)
  };
}

function employeeFromDb(row) {
  return {
    id: row.id,
    employeeCode: row.employee_code || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    address: row.address || "",
    contactNumber: row.contact_number || "",
    email: row.email || "",
    position: row.position || "",
    employmentStatus: row.employment_status || "Active",
    remarks: row.remarks || "",
    archived: Boolean(row.archived),
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function salesMonitoringFromDb(row) {
  return {
    id: row.id,
    cooperatorId: row.cooperator_id || "",
    assignedStaff: row.assigned_staff || "",
    assistanceYear: n(row.assistance_year),
    firmName: row.firm_name || "",
    reportingMonth: uiDate(row.reporting_month),
    benchmarkMonthlyGrossSales: n(row.benchmark_monthly_gross_sales),
    grossSales: n(row.gross_sales),
    jobsGeneratedBefore: n(row.jobs_generated_before),
    jobsGeneratedAfter: n(row.jobs_generated_after),
    assignedEmployeeId: row.assigned_employee_id || "",
    monthlyTotalProductionCost: n(row.monthly_total_production_cost),
    productionCostPercentage: n(row.production_cost_percentage),
    initialProductivity: n(row.initial_productivity),
    remarks: row.remarks || "",
    archived: Boolean(row.archived),
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function settingsFromDb(row) {
  if (!row) return defaultSettings;
  return {
    organizationName: row.organization_name || "",
    officeAddress: row.office_address || "",
    officeContact: row.office_contact || "",
    defaultReportHeading: row.default_report_heading || "",
    currencyFormat: row.currency_format || "Philippine Peso",
    dateFormat: row.date_format || "MMM DD, YYYY",
    defaultRepaymentMonths: n(row.default_repayment_months) || 36,
    preparedBy: row.prepared_by || "",
    reviewedBy: row.reviewed_by || "",
    approvedBy: row.approved_by || "",
    defaultRowsPerTable: n(row.default_rows_per_table) || 10,
    themePreference: row.theme_preference || "Light"
  };
}

function activityFromDb(row) {
  return {
    id: row.id,
    beneficiaryId: row.cooperator_id || "",
    action: row.action || "",
    timestamp: row.created_at || ""
  };
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
    n(row.assistance_amount) === 0 &&
    n(row.monthly_refund_amount) === 0 &&
    uiDate(row.repayment_start_date) === "" &&
    uiDate(row.original_due_date) === "";
  return noRefundTerms ? 0 : n(row.installments);
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

function beneficiaryToDb(record) {
  const cooperator = record.cooperator || {};
  const business = record.business || {};
  const assets = business.assets || record.assets || {};
  return {
    id: uuidOrNew(record.id),
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

function allocationToDb(paymentId, allocation) {
  return {
    payment_id: paymentId,
    cooperator_id: uuidOrNull(allocation.beneficiaryId),
    installment_number: Number(allocation.installmentNumber || 0),
    amount: Number(allocation.amount || 0)
  };
}

function paymentToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.beneficiaryId),
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

function receiptToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.beneficiaryId),
    payment_id: uuidOrNull(record.paymentId),
    or_number: record.orNumber,
    or_date: record.orDate,
    amount: Number(record.amount || 0),
    penalty_amount: Number(record.penaltyAmount || 0),
    attachment_name: record.attachmentName || "",
    remarks: record.remarks || "",
    archived: Boolean(record.archived)
  };
}

function defermentToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.beneficiaryId),
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

function adjustmentToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.beneficiaryId),
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

function documentToDb(record) {
  return {
    id: uuidOrNew(record.id),
    category: record.category,
    cooperator_id: uuidOrNull(record.beneficiaryId),
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

function employeeToDb(record) {
  return {
    id: uuidOrNew(record.id),
    employee_code: record.employeeCode || "",
    first_name: record.firstName || "",
    last_name: record.lastName || "",
    address: record.address || "",
    contact_number: record.contactNumber || "",
    email: record.email || "",
    position: record.position || "",
    employment_status: record.employmentStatus || "Active",
    remarks: record.remarks || "",
    archived: Boolean(record.archived),
    created_by: uuidOrNull(record.createdBy)
  };
}

function salesMonitoringToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.cooperatorId),
    assigned_staff: record.assignedStaff || "",
    assistance_year: Number(record.assistanceYear || new Date().getFullYear()),
    firm_name: record.firmName || "",
    reporting_month: dbDate(record.reportingMonth),
    benchmark_monthly_gross_sales: Number(record.benchmarkMonthlyGrossSales || 0),
    gross_sales: Number(record.grossSales || 0),
    jobs_generated_before: Number(record.jobsGeneratedBefore || 0),
    jobs_generated_after: Number(record.jobsGeneratedAfter || 0),
    assigned_employee_id: uuidOrNull(record.assignedEmployeeId),
    monthly_total_production_cost: Number(record.monthlyTotalProductionCost || 0),
    production_cost_percentage: Number(record.productionCostPercentage || 0),
    initial_productivity: Number(record.initialProductivity || 0),
    remarks: record.remarks || "",
    archived: Boolean(record.archived),
    created_by: uuidOrNull(record.createdBy)
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

function activityToDb(record) {
  return {
    id: uuidOrNew(record.id),
    cooperator_id: uuidOrNull(record.beneficiaryId),
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
  employees: { table: "employees", fromDb: employeeFromDb, toDb: employeeToDb },
  salesMonitoring: { table: "cooperator_sales_monitoring", fromDb: salesMonitoringFromDb, toDb: salesMonitoringToDb },
  activity: { table: "activity_log", fromDb: activityFromDb, toDb: activityToDb }
};

export async function readSupabaseStateDirect() {
  const [beneficiaries, services, setupPhases, payments, allocations, receipts, deferments, adjustments, documents, employees, salesMonitoring, settings, activity] = await Promise.all([
    supabaseRest.selectAll("cooperators", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("cooperator_services", "select=*"),
    supabaseRest.selectAll("cooperator_setup_phases", "select=*&order=phase_label.asc"),
    supabaseRest.selectAll("payments", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("payment_allocations", "select=*"),
    supabaseRest.selectAll("receipts", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("deferments", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("account_adjustments", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("documents", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("employees", "select=*&order=created_at.desc"),
    supabaseRest.selectAll("cooperator_sales_monitoring", "select=*&order=reporting_month.desc"),
    supabaseRest.select("system_settings", "select=*&id=eq.1&limit=1"),
    supabaseRest.select("activity_log", "select=*&order=created_at.desc&limit=100")
  ]);

  return {
    beneficiaries: beneficiaries.map((beneficiary) => beneficiaryFromDb(beneficiary, services, setupPhases)),
    payments: payments.map((payment) => paymentFromDb(payment, allocations)),
    receipts: receipts.map(receiptFromDb),
    deferments: deferments.map(defermentFromDb),
    adjustments: adjustments.map(adjustmentFromDb),
    documents: documents.map(documentFromDb),
    employees: employees.map(employeeFromDb),
    salesMonitoring: salesMonitoring.map(salesMonitoringFromDb),
    settings: settingsFromDb(settings[0]),
    activity: activity.map(activityFromDb)
  };
}

export async function upsertSupabaseDirect(collection, records) {
  const adapter = adapters[collection];
  if (!adapter) return [];
  const source = Array.isArray(records) ? records : [records];
  const existingIds = new Set();
  if (collection === "beneficiaries") {
    for (const record of source) {
      if (!isUuid(record.id)) continue;
      const existing = await supabaseRest.select("cooperators", `select=id&id=eq.${encodeURIComponent(record.id)}&limit=1`);
      if (existing.length) existingIds.add(record.id);
    }
  }
  const rows = source.map((record) => stripUndefined(adapter.toDb(record)));
  const savedRows = await supabaseRest.upsert(adapter.table, rows);
  if (collection === "payments") {
    for (const [index, record] of source.entries()) {
      const paymentId = savedRows[index]?.id || rows[index]?.id;
      await supabaseRest.deleteWhere("payment_allocations", "payment_id", paymentId);
      const allocations = (record.allocations || []).map((allocation) => allocationToDb(paymentId, allocation));
      if (allocations.length) await supabaseRest.insert("payment_allocations", allocations);
    }
    return savedRows.map((row, index) => {
      const original = source[index];
      return paymentFromDb(row, (original?.allocations || []).map((allocation) => ({ payment_id: row.id, ...allocationToDb(row.id, allocation) })));
    });
  }
  if (collection === "beneficiaries") {
    try {
      for (const [index, record] of source.entries()) {
        const cooperatorId = savedRows[index]?.id || rows[index]?.id;
        await supabaseRest.deleteWhere("cooperator_services", "cooperator_id", cooperatorId);
        const services = (record.services || [])
          .filter((service) => service.category)
          .map((service, serviceIndex) => serviceToDb(cooperatorId, service, serviceIndex));
        if (services.length) await supabaseRest.insert("cooperator_services", services);
        await supabaseRest.deleteWhere("cooperator_setup_phases", "cooperator_id", cooperatorId);
        const setupPhases = (record.services || [])
          .filter((service) => service.category === "SETUP")
          .map((service, phaseIndex) => setupPhaseToDb(cooperatorId, service, phaseIndex));
        if (setupPhases.length) await supabaseRest.insert("cooperator_setup_phases", setupPhases);
      }
    } catch (error) {
      for (const [index, record] of source.entries()) {
        const cooperatorId = savedRows[index]?.id || rows[index]?.id;
        if (!existingIds.has(record.id)) await supabaseRest.deleteWhere("cooperators", "id", cooperatorId).catch(() => {});
      }
      throw error;
    }
    return savedRows.map((row, index) => {
      const original = source[index];
      const services = (original?.services || []).map((service, index) => serviceToDb(row.id, service, index));
      const setupPhases = (original?.services || []).filter((service) => service.category === "SETUP").map((service, index) => setupPhaseToDb(row.id, service, index));
      return beneficiaryFromDb(row, services, setupPhases);
    });
  }
  return savedRows.map(adapter.fromDb);
}

export async function patchSupabaseDirect(collection, id, patch) {
  const current = await readSupabaseStateDirect();
  const existing = current[collection]?.find((item) => item.id === id);
  if (!existing) return null;
  const [saved] = await upsertSupabaseDirect(collection, { ...existing, ...patch });
  return saved || null;
}

export async function removeSupabaseDirect(collection, id) {
  const adapter = adapters[collection];
  if (!adapter) return;
  if (collection === "beneficiaries") {
    await supabaseRest.deleteWhere("receipts", "cooperator_id", id);
    await supabaseRest.deleteWhere("payment_allocations", "cooperator_id", id);
    await supabaseRest.deleteWhere("payments", "cooperator_id", id);
    await supabaseRest.deleteWhere("deferments", "cooperator_id", id);
    await supabaseRest.deleteWhere("account_adjustments", "cooperator_id", id);
    await supabaseRest.deleteWhere("documents", "cooperator_id", id);
    await supabaseRest.deleteWhere("cooperator_services", "cooperator_id", id);
    await supabaseRest.deleteWhere("cooperator_setup_phases", "cooperator_id", id);
  }
  if (collection === "payments") {
    await supabaseRest.deleteWhere("receipts", "payment_id", id);
    await supabaseRest.deleteWhere("payment_allocations", "payment_id", id);
  }
  await supabaseRest.deleteWhere(adapter.table, "id", id);
}

export async function saveSupabaseStateDirect(state) {
  for (const collection of ["beneficiaries", "employees", "payments", "receipts", "deferments", "adjustments", "documents", "salesMonitoring", "activity"]) {
    if (Array.isArray(state[collection]) && state[collection].length) await upsertSupabaseDirect(collection, state[collection]);
  }
  if (state.settings) await supabaseRest.upsert("system_settings", settingsToDb(state.settings));
  return readSupabaseStateDirect();
}

export async function uploadSupabaseDocumentDirect(record, file) {
  if (!file) return "";
  const safeName = `${record.id}-${(file.name || "document").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "") || "document"}`;
  const storagePath = `${record.beneficiaryId || "unassigned"}/${safeName}`;
  await supabaseRest.uploadDocument(storagePath, file);
  return storagePath;
}
