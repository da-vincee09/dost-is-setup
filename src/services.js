import { accountStatuses, paymentStatuses, reconciliationStatuses } from "./status.js";
import {
  businessSectors,
  businessTypes,
  municipalities,
  municipalityDistrictMap,
  serviceCategories,
  serviceSubtypes,
  setupProjectStatuses,
  sourceFunds,
  yesNoOptions
} from "./referenceData.js";
import * as XLSX from "./vendor/xlsx.mjs";
import {
  addMonths,
  daysBetween,
  percent,
  todayIso,
  toNumber,
  roundCurrency,
  uid,
  validateEmail,
  validatePhone,
  isValidDate,
  dateAfter
} from "./utils.js";
import { repository } from "./repository.js";

export const lookups = {
  accountStatuses,
  businessSectors,
  businessTypes,
  paymentStatuses,
  reconciliationStatuses,
  municipalities,
  municipalityDistrictMap,
  districts: ["1st District", "2nd District"],
  sourceFunds,
  serviceCategories,
  serviceSubtypes,
  setupProjectStatuses,
  yesNoOptions,
  paymentMethods: ["Cash", "Check", "PDC", "PMO", "Bank Deposit", "Bank Transfer", "Other"],
  paymentBanks: ["Land Bank of the Philippines", "Development Bank of the Philippines", "BDO Unibank", "Bank of the Philippine Islands", "Metrobank", "Philippine National Bank", "RCBC", "Security Bank", "UnionBank", "China Bank", "EastWest Bank", "Other"],
  employmentStatuses: ["Active", "Inactive", "Contractual", "Seasonal", "Resigned", "Terminated"],
  defermentStatuses: ["Pending Documentation", "Approved Externally", "Rejected Externally", "Cancelled", "Completed"],
  adjustmentTypes: [
    "Compromise Agreement",
    "Revised Repayment Terms",
    "Added Fee",
    "Penalty Adjustment",
    "Waived Amount",
    "Equipment Pull-out",
    "Terminated Project",
    "Withdrawn Project",
    "Write-off",
    "Manual Correction"
  ],
  documentCategories: [
    "Project Agreement",
    "Official Receipt",
    "Check or PDC Image",
    "Proof of Deposit",
    "Deferment Approval",
    "Compromise Agreement",
    "Termination Document",
    "Equipment Pull-out Document",
    "Other Supporting Document"
  ]
};

const setupCategory = "SETUP";
const validPaymentStatuses = new Set(["Received", "Deposited", "Cleared"]);
const terminatedStatuses = new Set(["Terminated", "Withdrawn", "Archived"]);

export function getMunicipalityDistrict(municipality) {
  return municipalityDistrictMap[municipality] || "";
}

export function calculateAge(birthDate, asOf = todayIso()) {
  if (!isValidDate(birthDate)) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  const reference = new Date(`${asOf}T00:00:00`);
  let age = reference.getFullYear() - birth.getFullYear();
  const birthdayHasPassed =
    reference.getMonth() > birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() >= birth.getDate());
  if (!birthdayHasPassed) age -= 1;
  return age >= 0 && age <= 130 ? age : "";
}

export function getSeniorCitizenClassification(birthDate, asOf = todayIso()) {
  const age = calculateAge(birthDate, asOf);
  if (age === "") return "Not yet classified";
  return age >= 60 ? "Yes" : "No";
}

function yesNoValue(value) {
  if (value === true || value === "true" || value === "Yes") return "Yes";
  if (value === false || value === "false" || value === "No") return "No";
  return "";
}

export function getAssetTotal(assets = {}) {
  return roundCurrency(
    toNumber(assets.land) +
      toNumber(assets.building) +
      toNumber(assets.equipment) +
      toNumber(assets.revolvingCapital)
  );
}

export function getEnterpriseClassification(value) {
  const hasAssetInput =
    typeof value === "number" ||
    ["land", "building", "equipment", "revolvingCapital"].some((key) => String(value?.[key] ?? "").trim() !== "");
  if (!hasAssetInput) return "Not yet classified";
  const total = typeof value === "number" ? value : getAssetTotal(value);
  if (total < 3000000) return "Micro Enterprise";
  if (total >= 3000000 && total < 15000000) return "Small Enterprise";
  return "Medium Enterprise";
}

export function getRefundMonthCount(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return 0;
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  return Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
}

function isAfterDueMonth(dueDate, asOf) {
  return Boolean(dueDate && asOf.slice(0, 7) > dueDate.slice(0, 7));
}

function normalizeServices(beneficiary = {}) {
  const saved = Array.isArray(beneficiary.services) ? beneficiary.services : [];
  const services = saved
    .map((service) => ({
      id: service.id || "",
      category: service.category || "",
      subtype: service.subtype || "",
      dateAvailed: service.dateAvailed || "",
      remarks: service.remarks || "",
      legacy: Boolean(service.legacy)
    }))
    .filter((service) => service.category);
  if (services.length) return services;
  const hasLegacySetupProject =
    String(beneficiary.project?.sourceOfFund || "").trim().toUpperCase() === setupCategory;
  return hasLegacySetupProject
    ? [{
        category: setupCategory,
        subtype: "",
        dateAvailed: beneficiary.financial?.releaseDate || "",
        remarks: "Legacy SETUP refund project record.",
        legacy: true
      }]
    : [];
}

const setupPhaseLabels = ["Phase I", "Phase II", "Phase III", "Phase IV", "Phase V", "Phase VI", "Phase VII", "Phase VIII", "Phase IX", "Phase X"];
const setupPhasePrefix = "[SETUP_PHASE]";
const setupStatusValues = new Set(["Pending", ...setupProjectStatuses, "Cancelled", "Returned"]);

export function parseSetupPhaseRemarks(remarks = "") {
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

export function formatSetupPhaseRemarks(phase = {}) {
  const payload = {
    status: phase.status || "",
    projectTitle: phase.projectTitle || "",
    yearAwarded: phase.yearAwarded || "",
    officer: phase.officer || "",
    fundAssistance: phase.fundAssistance || "",
    releaseDate: phase.releaseDate || phase.dateAvailed || "",
    monthlyRefund: phase.monthlyRefund || "",
    refundStart: phase.refundStart || phase.repaymentStartDate || "",
    refundEnd: phase.refundEnd || phase.originalDueDate || "",
    numberOfMonths: phase.numberOfMonths || phase.installments || "",
    technologyTransferFee: phase.technologyTransferFee || "",
    optionToBuyAmount: phase.optionToBuyAmount || "",
    otherFees: phase.otherFees || "",
    financialRemarks: phase.financialRemarks || "",
    archived: Boolean(phase.archived),
    archivedAt: phase.archivedAt || "",
    notes: phase.notes || phase.remarks || ""
  };
  return `${setupPhasePrefix}${JSON.stringify(payload)}`;
}

export function setupPhaseOptions() {
  return [...setupPhaseLabels];
}

export function isPhaseOne(phase = "") {
  return String(phase || "").trim().toLowerCase() === "phase i";
}

export function isRefundApplicableToPhase() {
  return true;
}

export function setupPhasePaymentKey(phase = {}, cooperator = {}) {
  const title = String(phase.projectTitle || cooperator.setup?.projectTitle || cooperator.projectTitle || "SETUP Project").trim() || "SETUP Project";
  const label = String(phase.phase || "Phase I").trim() || "Phase I";
  return `${title} / ${label}`;
}

function phaseHasRefundScheme(phase = {}) {
  return Boolean(
    toNumber(phase.fundAssistance) > 0 &&
      toNumber(phase.monthlyRefund) > 0 &&
      phase.refundStart &&
      phase.refundEnd &&
      Number(phase.numberOfMonths || getRefundMonthCount(phase.refundStart, phase.refundEnd) || 0) > 0
  );
}

function isPhaseArchived(phase = {}) {
  return Boolean(phase.archived);
}

function summarizeSetupStatusFromPhases(phases = [], fallback = { status: "Ongoing", source: "Automatically calculated" }) {
  if (!phases.length) return fallback;
  const visiblePhases = phases.filter((phase) => !isPhaseArchived(phase));
  if (!visiblePhases.length) return { status: "Archived", source: "Phase records" };
  if (visiblePhases.some((phase) => phase.status === "Ongoing")) return { status: "Ongoing", source: "Phase records" };
  if (visiblePhases.some((phase) => ["Pending", "Returned", "Cancelled"].includes(phase.status))) return { status: "Ongoing", source: "Phase records" };
  if (visiblePhases.every((phase) => phase.status === "Completed")) return { status: "Completed", source: "Phase records" };
  if (visiblePhases.every((phase) => phase.status === "Terminated")) return { status: "Terminated", source: "Phase records" };
  return fallback;
}

function setupPhasesForBeneficiary(beneficiary = {}, setupStatus = { status: "Ongoing", source: "" }) {
  const setupFinancial = beneficiary.setup?.financial || {};
  const setupServices = normalizeServices(beneficiary).filter((service) => service.category === setupCategory);
  return setupServices.map((service, index) => {
    const meta = parseSetupPhaseRemarks(service.remarks);
    const isPrimary = index === 0;
    const legacyArchived = meta.status === "Archived";
    const archived = Boolean(meta.archived || legacyArchived);
    const status = meta.status && meta.status !== "Archived" ? meta.status : isPrimary ? setupStatus.status : "Pending";
    return {
      id: service.id || `${beneficiary.id || "setup"}-phase-${index + 1}`,
      phase: setupPhaseLabels.includes(service.subtype) ? service.subtype : setupPhaseLabels[index] || service.subtype || `Phase ${index + 1}`,
      status,
      statusSource: meta.status && meta.status !== "Archived" ? "Phase record" : isPrimary ? setupStatus.source : "Phase record",
      projectTitle: meta.projectTitle || (isPrimary ? beneficiary.setup?.projectTitle || beneficiary.project?.title || "" : ""),
      yearAwarded: meta.yearAwarded || (isPrimary ? beneficiary.setup?.yearAwarded || beneficiary.project?.projectYear || "" : ""),
      officer: meta.officer || (isPrimary ? beneficiary.setup?.assignedProjectOfficer || beneficiary.project?.officer || "" : ""),
      fundAssistance: toNumber(meta.fundAssistance || (isPrimary ? setupFinancial.fundAssistance ?? beneficiary.financial?.assistanceAmount : 0)),
      releaseDate: meta.releaseDate || service.dateAvailed || (isPrimary ? beneficiary.financial?.releaseDate || "" : ""),
      monthlyRefund: toNumber(meta.monthlyRefund || (isPrimary ? setupFinancial.monthlyRefund ?? beneficiary.financial?.monthlyRefundAmount : 0)),
      refundStart: meta.refundStart || (isPrimary ? setupFinancial.refundStart || beneficiary.financial?.repaymentStartDate || "" : ""),
      refundEnd: meta.refundEnd || (isPrimary ? setupFinancial.refundEnd || beneficiary.financial?.originalDueDate || "" : ""),
      numberOfMonths: Number(meta.numberOfMonths || getRefundMonthCount(meta.refundStart, meta.refundEnd) || (isPrimary ? setupFinancial.numberOfMonths || beneficiary.financial?.installments || 0 : 0)),
      technologyTransferFee: toNumber(meta.technologyTransferFee || (isPrimary ? beneficiary.financial?.technologyTransferFee : 0)),
      optionToBuyAmount: toNumber(meta.optionToBuyAmount || (isPrimary ? beneficiary.financial?.optionToBuyAmount : 0)),
      otherFees: toNumber(meta.otherFees || (isPrimary ? beneficiary.financial?.otherFees : 0)),
      financialRemarks: meta.financialRemarks || (isPrimary ? beneficiary.financial?.remarks || "" : ""),
      archived,
      archivedAt: meta.archivedAt || "",
      refundApplicable: true,
      notes: meta.notes || ""
    };
  });
}

export function hasSetupService(beneficiary = {}) {
  return normalizeServices(beneficiary).some((service) => service.category === setupCategory);
}

export function deriveSetupProjectStatus(beneficiary = {}, financials = null, asOf = todayIso()) {
  const manualStatus = beneficiary.setup?.manualStatus || "";
  if (["Pending", "Cancelled", "Returned"].includes(manualStatus)) {
    return { status: manualStatus, source: "Manually assigned" };
  }
  if (
    manualStatus === "Terminated" ||
    beneficiary.project?.status === "Terminated" ||
    beneficiary.status === "Terminated" ||
    beneficiary.status === "Withdrawn"
  ) {
    return { status: "Terminated", source: "Manually assigned" };
  }
  if (financials?.outstandingBalance <= 0.01 && financials?.totalRepayable > 0) {
    return { status: "Completed", source: "Automatically calculated" };
  }
  if (manualStatus === "Completed" && !financials?.totalRepayable) return { status: "Completed", source: "Manually assigned" };
  if (manualStatus === "Ongoing") return { status: "Ongoing", source: "Manually assigned" };
  if (beneficiary.financial?.repaymentStartDate && beneficiary.financial.repaymentStartDate > asOf) {
    return { status: "Ongoing", source: "Automatically calculated" };
  }
  return { status: "Ongoing", source: "Automatically calculated" };
}

export function getCooperatorView(beneficiary = {}, financials = null, asOf = todayIso()) {
  const cooperator = beneficiary.cooperator || {};
  const business = beneficiary.business || {};
  const savedAssets = business.assets || beneficiary.assets || {};
  const assets = {
    land: toNumber(savedAssets.land),
    building: toNumber(savedAssets.building),
    equipment: toNumber(savedAssets.equipment),
    revolvingCapital: toNumber(savedAssets.revolvingCapital)
  };
  const totalAssets = getAssetTotal(savedAssets);
  const municipality = business.municipality || beneficiary.municipality || "";
  const district = business.district || getMunicipalityDistrict(municipality);
  const birthDate = cooperator.birthDate || beneficiary.birthDate || "";
  const age = calculateAge(birthDate, asOf);
  const services = normalizeServices(beneficiary);
  const setupFinancial = beneficiary.setup?.financial || {};
  const refundStart = setupFinancial.refundStart || beneficiary.financial?.repaymentStartDate || "";
  const refundEnd = setupFinancial.refundEnd || beneficiary.financial?.originalDueDate || "";
  const numberOfMonths = Number(setupFinancial.numberOfMonths || beneficiary.financial?.installments || getRefundMonthCount(refundStart, refundEnd) || 0);
  const manualStatus = beneficiary.setup?.manualStatus || "";
  const baseSetupStatus = deriveSetupProjectStatus(beneficiary, financials, asOf);
  const setupPhases = setupPhasesForBeneficiary(beneficiary, baseSetupStatus);
  const setupStatus = summarizeSetupStatusFromPhases(setupPhases, baseSetupStatus);
  return {
    id: beneficiary.id || "",
    firmName: business.firmName || beneficiary.firmName || "Not provided",
    cooperatorName: cooperator.name || beneficiary.proprietor || "Not provided",
    sex: cooperator.sex || "",
    birthDate,
    age,
    seniorCitizenClassification: getSeniorCitizenClassification(birthDate, asOf),
    pwd: yesNoValue(cooperator.isPwd ?? beneficiary.isPwd),
    indigenousPeople: yesNoValue(cooperator.isIndigenousPeople ?? beneficiary.isIndigenousPeople),
    contactNumber: cooperator.contactNumber || beneficiary.contactNumber || "",
    email: cooperator.email || beneficiary.email || "",
    completeAddress: business.completeAddress || beneficiary.address || "",
    municipality,
    district,
    businessType: business.businessType || "",
    businessSector: business.businessSector || "",
    assets: {
      ...assets,
      total: totalAssets
    },
    enterpriseClassification: business.enterpriseClassification || getEnterpriseClassification(savedAssets),
    services,
    hasSetup: services.some((service) => service.category === setupCategory),
    setup: {
      projectTitle: beneficiary.setup?.projectTitle || beneficiary.project?.title || "",
      yearAwarded: beneficiary.setup?.yearAwarded || beneficiary.project?.projectYear || "",
      assignedProjectOfficer: beneficiary.setup?.assignedProjectOfficer || beneficiary.project?.officer || "",
      manualStatus,
      calculatedStatus: setupStatus.status,
      statusSource: setupStatus.source,
      phases: setupPhases,
      financial: {
        fundAssistance: toNumber(setupFinancial.fundAssistance ?? beneficiary.financial?.assistanceAmount),
        monthlyRefund: toNumber(setupFinancial.monthlyRefund ?? beneficiary.financial?.monthlyRefundAmount),
        refundStart,
        refundEnd,
        numberOfMonths
      }
    },
    legacy: {
      spin: beneficiary.project?.spin || "",
      sourceOfFund: beneficiary.project?.sourceOfFund || ""
    }
  };
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

function addMonthKey(key, count = 1) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(year, month - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthName(monthIndex) {
  return new Date(2026, monthIndex, 1).toLocaleDateString("en-PH", { month: "short" });
}

function monthYearLabel(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return key || "";
  return `${monthName(month - 1)} ${year}`;
}

function isActivePayment(payment, asOf = "") {
  if (payment.archived) return false;
  if (["Pending", "Returned", "Replaced", "Cancelled"].includes(payment.status)) return false;
  if (asOf && payment.paymentDate > asOf) return false;
  return true;
}

function isOpenPaymentInstrument(payment, asOf = "") {
  if (payment.archived) return false;
  if (["Returned", "Replaced", "Cancelled"].includes(payment.status)) return false;
  if (asOf && payment.paymentDate > asOf) return false;
  return true;
}

function activePayments(state, beneficiaryId, asOf = "") {
  return (getStateIndexes(state).paymentsByBeneficiaryId.get(beneficiaryId) || []).filter((payment) => isActivePayment(payment, asOf));
}

function adjustmentEffect(adjustment, asOf = "") {
  if (adjustment.archived) return 0;
  if (asOf && adjustment.effectiveDate && adjustment.effectiveDate > asOf) return 0;
  if (["Added Fee", "Penalty Adjustment"].includes(adjustment.type)) return Number(adjustment.amount || 0);
  if (["Waived Amount", "Write-off", "Equipment Pull-out", "Terminated Project", "Withdrawn Project"].includes(adjustment.type)) {
    return -Number(adjustment.amount || 0);
  }
  return 0;
}

function isApprovedDefermentEffective(deferment, asOf = "") {
  if (deferment.archived || deferment.status !== "Approved Externally") return false;
  if (!asOf) return true;
  const approvalDate = deferment.approvalDate || deferment.requestDate || deferment.startDate;
  return !approvalDate || approvalDate <= asOf;
}

const scheduleCache = new Map();
const financialCache = new Map();
let cacheVersion = -1;
let indexCacheVersion = -1;
let indexCache = null;

function addToIndex(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function getStateIndexes(state = repository.getSnapshot()) {
  const version = repository.getVersion();
  if (indexCache && indexCacheVersion === version) return indexCache;
  const indexes = {
    beneficiariesById: new Map(),
    employeesById: new Map(),
    paymentsByBeneficiaryId: new Map(),
    receiptsByPaymentId: new Map(),
    receiptsByBeneficiaryId: new Map(),
    defermentsByBeneficiaryId: new Map(),
    adjustmentsByBeneficiaryId: new Map()
  };
  state.beneficiaries.forEach((beneficiary) => indexes.beneficiariesById.set(beneficiary.id, beneficiary));
  (state.employees || []).forEach((employee) => indexes.employeesById.set(employee.id, employee));
  state.payments.forEach((payment) => addToIndex(indexes.paymentsByBeneficiaryId, payment.beneficiaryId, payment));
  state.receipts.forEach((receipt) => {
    if (!indexes.receiptsByPaymentId.has(receipt.paymentId)) indexes.receiptsByPaymentId.set(receipt.paymentId, receipt);
    addToIndex(indexes.receiptsByBeneficiaryId, receipt.beneficiaryId, receipt);
  });
  state.deferments.forEach((deferment) => addToIndex(indexes.defermentsByBeneficiaryId, deferment.beneficiaryId, deferment));
  state.adjustments.forEach((adjustment) => addToIndex(indexes.adjustmentsByBeneficiaryId, adjustment.beneficiaryId, adjustment));
  indexCache = indexes;
  indexCacheVersion = version;
  return indexes;
}

function cacheKey(kind, beneficiaryId, asOf) {
  const version = repository.getVersion();
  if (version !== cacheVersion) {
    scheduleCache.clear();
    financialCache.clear();
    cacheVersion = version;
  }
  return `${kind}:${version}:${beneficiaryId}:${asOf}`;
}

export function getTotalRepayable(beneficiary, state = repository.getSnapshot(), asOf = "") {
  const base =
    Number(beneficiary.financial.assistanceAmount || 0) +
    Number(beneficiary.financial.technologyTransferFee || 0) +
    Number(beneficiary.financial.optionToBuyAmount || 0) +
    Number(beneficiary.financial.otherFees || 0);
  const adjustmentTotal = (getStateIndexes(state).adjustmentsByBeneficiaryId.get(beneficiary.id) || [])
    .reduce((sum, item) => sum + adjustmentEffect(item, asOf), 0);
  return roundCurrency(Math.max(0, base + adjustmentTotal));
}

export function getTotalPaid(beneficiaryId, state = repository.getSnapshot(), asOf = "") {
  return roundCurrency(activePayments(state, beneficiaryId, asOf).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
}

export function getSchedule(beneficiaryId, asOf = todayIso()) {
  const key = cacheKey("schedule", beneficiaryId, asOf);
  if (scheduleCache.has(key)) return scheduleCache.get(key);
  const state = repository.getSnapshot();
  const indexes = getStateIndexes(state);
  const beneficiary = indexes.beneficiariesById.get(beneficiaryId);
  if (!beneficiary) return [];
  const totalRepayable = getTotalRepayable(beneficiary, state, asOf);
  const installmentCount = Number(beneficiary.financial.installments || 1);
  const regularExpected = Number(beneficiary.financial.monthlyRefundAmount || totalRepayable / installmentCount);
  const payments = activePayments(state, beneficiaryId, asOf);
  const deferments = (indexes.defermentsByBeneficiaryId.get(beneficiaryId) || []).filter((item) => isApprovedDefermentEffective(item, asOf));
  const allocationStats = new Map();
  payments.forEach((payment) => {
    (payment.allocations || []).forEach((allocation) => {
      const installmentNumber = Number(allocation.installmentNumber || 0);
      if (!installmentNumber) return;
      const stats = allocationStats.get(installmentNumber) || { amountPaid: 0, latestPaymentDate: "", receiptNumbers: [] };
      stats.amountPaid += Number(allocation.amount || 0);
      if (!stats.latestPaymentDate || payment.paymentDate > stats.latestPaymentDate) stats.latestPaymentDate = payment.paymentDate;
      const receipt = indexes.receiptsByPaymentId.get(payment.id);
      if (receipt && !receipt.archived && (!asOf || receipt.orDate <= asOf) && receipt.orNumber) stats.receiptNumbers.push(receipt.orNumber);
      allocationStats.set(installmentNumber, stats);
    });
  });
  let runningPaid = 0;
  let runningExpected = 0;
  const schedule = Array.from({ length: installmentCount }, (_, index) => {
    const installmentNumber = index + 1;
    const dueDate = addMonths(beneficiary.financial.repaymentStartDate, index);
    const expected = index === installmentCount - 1 ? Math.max(0, totalRepayable - runningExpected) : Math.min(regularExpected, Math.max(0, totalRepayable - runningExpected));
    runningExpected += expected;
    const stats = allocationStats.get(installmentNumber) || { amountPaid: 0, latestPaymentDate: "", receiptNumbers: [] };
    const amountPaid = roundCurrency(stats.amountPaid);
    runningPaid += amountPaid;
    const remaining = roundCurrency(Math.max(0, expected - amountPaid));
    const deferred = deferments.some((deferment) => dueDate >= deferment.startDate && dueDate <= deferment.endDate);
    let status = "Upcoming";
    if (deferred) status = "Deferred";
    else if (amountPaid >= expected) status = "Paid";
    else if (isAfterDueMonth(dueDate, asOf)) status = "Overdue";
    else if (amountPaid > 0) status = "Partially Paid";
    else if (daysBetween(dueDate, asOf) === 0) status = "Due";
    else if (daysBetween(dueDate, asOf) > 0) status = "Due";
    return {
      installmentNumber,
      dueDate,
      refundMonth: monthKey(dueDate),
      expectedAmount: roundCurrency(expected),
      amountPaid,
      remainingAmount: remaining,
      paymentDate: stats.latestPaymentDate,
      orNumber: [...new Set(stats.receiptNumbers)].join(", "),
      runningBalance: roundCurrency(Math.max(0, totalRepayable - runningPaid)),
      daysOverdue: status === "Overdue" ? daysBetween(dueDate, asOf) : 0,
      status,
      remarks: deferred
        ? "Covered by approved deferment."
        : status === "Overdue" && amountPaid > 0
            ? "Partially paid; remaining amount is overdue."
            : amountPaid > expected
              ? "Includes advance allocation."
              : ""
    };
  });
  scheduleCache.set(key, schedule);
  return schedule;
}

export function getBeneficiaryFinancials(beneficiaryId, asOf = todayIso()) {
  const key = cacheKey("financials", beneficiaryId, asOf);
  if (financialCache.has(key)) return financialCache.get(key);
  const state = repository.getSnapshot();
  const indexes = getStateIndexes(state);
  const beneficiary = indexes.beneficiariesById.get(beneficiaryId);
  if (!beneficiary) return null;
  const schedule = getSchedule(beneficiaryId, asOf);
  const totalRepayable = getTotalRepayable(beneficiary, state, asOf);
  const totalPaid = getTotalPaid(beneficiaryId, state, asOf);
  const scheduledDue = schedule
    .filter((item) => item.dueDate <= asOf)
    .reduce((sum, item) => sum + Number(item.expectedAmount || 0), 0);
  const dueRemaining = schedule
    .filter((item) => item.dueDate <= asOf && item.status !== "Deferred")
    .reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
  const rawPastDue = schedule
    .filter((item) => item.status === "Overdue")
    .reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
  const futurePaid = schedule
    .filter((item) => item.dueDate > asOf)
    .reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
  const dueOverpaid = schedule
    .filter((item) => item.dueDate <= asOf)
    .reduce((sum, item) => sum + Math.max(0, Number(item.amountPaid || 0) - Number(item.expectedAmount || 0)), 0);
  const outstandingBalance = roundCurrency(Math.max(0, totalRepayable - totalPaid));
  const amountDue = roundCurrency(Math.min(outstandingBalance, Math.max(0, dueRemaining)));
  const pastDue = roundCurrency(Math.min(outstandingBalance, rawPastDue));
  const advancePayment = roundCurrency(Math.min(outstandingBalance, Math.max(0, futurePaid + dueOverpaid)));
  const latestPayment = activePayments(state, beneficiaryId, asOf).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)).at(-1);
  const latestReceipt = (indexes.receiptsByBeneficiaryId.get(beneficiaryId) || [])
    .filter((receipt) => !receipt.archived && (!asOf || receipt.orDate <= asOf))
    .sort((a, b) => a.orDate.localeCompare(b.orDate))
    .at(-1);
  const approvedDefermentMonths = (indexes.defermentsByBeneficiaryId.get(beneficiaryId) || [])
    .filter((item) => isApprovedDefermentEffective(item, asOf))
    .reduce((sum, item) => sum + Number(item.months || 0), 0);
  const financials = {
    totalRepayable,
    totalPaid,
    outstandingBalance,
    amountDue,
    pastDue,
    advancePayment,
    refundPercentage: percent(totalPaid, totalRepayable),
    collectionRate: percent(totalPaid, totalRepayable),
    originalDueDate: beneficiary.financial.originalDueDate,
    adjustedDueDate: addMonths(beneficiary.financial.originalDueDate, approvedDefermentMonths),
    latestPayment,
    latestReceipt,
    schedule
  };
  financialCache.set(key, financials);
  return financials;
}

function paymentMatchesPhase(payment = {}, beneficiary = {}, cooperator = {}, phase = {}) {
  const key = setupPhasePaymentKey(phase, cooperator);
  const title = String(payment.projectTitle || "").trim();
  if (title === key) return true;
  if (!isPhaseOne(phase.phase)) return false;
  const legacyTitles = new Set([
    "",
    beneficiary.project?.title || "",
    beneficiary.setup?.projectTitle || "",
    cooperator.setup?.projectTitle || ""
  ].map((item) => String(item || "").trim()));
  return legacyTitles.has(title) && !/\/\s*Phase\s+/i.test(title);
}

function phasePayments(state, beneficiary, cooperator, phase, asOf = "") {
  return activePayments(state, beneficiary.id, asOf).filter((payment) => paymentMatchesPhase(payment, beneficiary, cooperator, phase));
}

export function getPhaseTotalFund(phase = {}) {
  return roundCurrency(
    toNumber(phase.fundAssistance) +
      toNumber(phase.technologyTransferFee) +
      toNumber(phase.optionToBuyAmount) +
      toNumber(phase.otherFees)
  );
}

export function getPhaseRefundSchedule({ beneficiary = {}, cooperator = {}, phase = {}, asOf = todayIso() } = {}) {
  if (!beneficiary?.id || !phaseHasRefundScheme(phase)) return [];
  const state = repository.getSnapshot();
  const indexes = getStateIndexes(state);
  const totalRepayable = getPhaseTotalFund(phase);
  const installmentCount = Number(phase.numberOfMonths || getRefundMonthCount(phase.refundStart, phase.refundEnd) || 0);
  const regularExpected = Number(phase.monthlyRefund || totalRepayable / Math.max(installmentCount, 1));
  const payments = phasePayments(state, beneficiary, cooperator, phase, asOf);
  const deferments = (indexes.defermentsByBeneficiaryId.get(beneficiary.id) || []).filter((item) => isApprovedDefermentEffective(item, asOf));
  const allocationStats = new Map();
  payments.forEach((payment) => {
    (payment.allocations || []).forEach((allocation) => {
      const installmentNumber = Number(allocation.installmentNumber || 0);
      if (!installmentNumber) return;
      const stats = allocationStats.get(installmentNumber) || { amountPaid: 0, latestPaymentDate: "", receiptNumbers: [] };
      stats.amountPaid += Number(allocation.amount || 0);
      if (!stats.latestPaymentDate || payment.paymentDate > stats.latestPaymentDate) stats.latestPaymentDate = payment.paymentDate;
      const receipt = indexes.receiptsByPaymentId.get(payment.id);
      if (receipt && !receipt.archived && (!asOf || receipt.orDate <= asOf) && receipt.orNumber) stats.receiptNumbers.push(receipt.orNumber);
      allocationStats.set(installmentNumber, stats);
    });
  });
  let runningPaid = 0;
  let runningExpected = 0;
  return Array.from({ length: installmentCount }, (_, index) => {
    const installmentNumber = index + 1;
    const dueDate = addMonths(phase.refundStart, index);
    const expected = index === installmentCount - 1 ? Math.max(0, totalRepayable - runningExpected) : Math.min(regularExpected, Math.max(0, totalRepayable - runningExpected));
    runningExpected += expected;
    const stats = allocationStats.get(installmentNumber) || { amountPaid: 0, latestPaymentDate: "", receiptNumbers: [] };
    const amountPaid = roundCurrency(stats.amountPaid);
    runningPaid += amountPaid;
    const remaining = roundCurrency(Math.max(0, expected - amountPaid));
    const deferred = deferments.some((deferment) => dueDate >= deferment.startDate && dueDate <= deferment.endDate);
    let status = "Upcoming";
    if (deferred) status = "Deferred";
    else if (amountPaid >= expected) status = "Paid";
    else if (isAfterDueMonth(dueDate, asOf)) status = "Overdue";
    else if (amountPaid > 0) status = "Partially Paid";
    else if (daysBetween(dueDate, asOf) >= 0) status = "Due";
    return {
      installmentNumber,
      phase: phase.phase || "Phase I",
      projectTitle: setupPhasePaymentKey(phase, cooperator),
      dueDate,
      refundMonth: monthKey(dueDate),
      expectedAmount: roundCurrency(expected),
      amountPaid,
      remainingAmount: remaining,
      paymentDate: stats.latestPaymentDate,
      orNumber: [...new Set(stats.receiptNumbers)].join(", "),
      runningBalance: roundCurrency(Math.max(0, totalRepayable - runningPaid)),
      daysOverdue: status === "Overdue" ? daysBetween(dueDate, asOf) : 0,
      status,
      remarks: deferred
        ? "Covered by approved deferment."
        : status === "Overdue" && amountPaid > 0
          ? "Partially paid; remaining amount is overdue."
          : amountPaid > expected
            ? "Includes advance allocation."
            : ""
    };
  });
}

export function getPhaseFinancials({ beneficiary = {}, cooperator = {}, phase = {}, asOf = todayIso() } = {}) {
  const state = repository.getSnapshot();
  const schedule = getPhaseRefundSchedule({ beneficiary, cooperator, phase, asOf });
  const totalRepayable = getPhaseTotalFund(phase);
  const payments = beneficiary?.id ? phasePayments(state, beneficiary, cooperator, phase, asOf) : [];
  const totalPaid = roundCurrency(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const scheduledDue = schedule.filter((item) => item.dueDate <= asOf).reduce((sum, item) => sum + Number(item.expectedAmount || 0), 0);
  const dueRemaining = schedule
    .filter((item) => item.dueDate <= asOf && item.status !== "Deferred")
    .reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
  const rawPastDue = schedule.filter((item) => item.status === "Overdue").reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
  const futurePaid = schedule.filter((item) => item.dueDate > asOf).reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
  const dueOverpaid = schedule.filter((item) => item.dueDate <= asOf).reduce((sum, item) => sum + Math.max(0, Number(item.amountPaid || 0) - Number(item.expectedAmount || 0)), 0);
  const outstandingBalance = roundCurrency(Math.max(0, totalRepayable - totalPaid));
  const amountDue = roundCurrency(Math.min(outstandingBalance, Math.max(0, dueRemaining)));
  const pastDue = roundCurrency(Math.min(outstandingBalance, rawPastDue));
  const advancePayment = roundCurrency(Math.min(outstandingBalance, Math.max(0, futurePaid + dueOverpaid)));
  const latestPayment = payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)).at(-1);
  return {
    totalRepayable,
    totalPaid,
    scheduledDue: roundCurrency(scheduledDue),
    outstandingBalance,
    amountDue,
    pastDue,
    advancePayment,
    refundPercentage: percent(totalPaid, totalRepayable),
    collectionRate: percent(totalPaid, totalRepayable),
    originalDueDate: phase.refundEnd || "",
    adjustedDueDate: phase.refundEnd || "",
    latestPayment,
    latestReceipt: null,
    schedule
  };
}

const manualAccountStatuses = new Set(["Archived", "Terminated", "Withdrawn", "Closed", "Compromise Agreement"]);
const activeDashboardStatuses = new Set(["Active - Current", "Active - Past Due", "Active - Advance Payment"]);

export function deriveAccountStatus(beneficiary, financials = getBeneficiaryFinancials(beneficiary.id), asOf = todayIso()) {
  if (!beneficiary) return "Under Review";
  if (beneficiary.archived || beneficiary.status === "Archived") return "Archived";
  if (manualAccountStatuses.has(beneficiary.status)) return beneficiary.status;
  const state = repository.getSnapshot();
  const hasActiveDeferment = (getStateIndexes(state).defermentsByBeneficiaryId.get(beneficiary.id) || []).some(
    (item) =>
      !item.archived &&
      isApprovedDefermentEffective(item, asOf) &&
      item.startDate <= asOf &&
      item.endDate >= asOf
  );
  if (hasActiveDeferment) return "Deferred";
  if (!financials) return beneficiary.status || "Under Review";
  if (financials.outstandingBalance <= 0.01 && financials.totalRepayable > 0) return "Fully Paid";
  if (financials.pastDue > 0.01) return "Active - Past Due";
  if (financials.advancePayment > 0.01) return "Active - Advance Payment";
  if (beneficiary.financial.repaymentStartDate && beneficiary.financial.repaymentStartDate > asOf) return "Not Yet Started";
  return "Active - Current";
}

export function hasExistingSetupRefund(beneficiary = {}, cooperator = getCooperatorView(beneficiary), financials = getBeneficiaryFinancials(beneficiary.id)) {
  const refundBearingPhase = (cooperator.setup?.phases || []).some((phase) => phaseHasRefundScheme(phase));
  return Boolean(
    hasSetupService(beneficiary) &&
      refundBearingPhase &&
      financials?.totalRepayable > 0 &&
      financials?.schedule?.length &&
      beneficiary.financial?.repaymentStartDate &&
      beneficiary.financial?.originalDueDate &&
      Number(beneficiary.financial?.monthlyRefundAmount || 0) > 0
  );
}

export function getRefundCompletionDate(beneficiary = {}, financials = getBeneficiaryFinancials(beneficiary.id)) {
  if (!financials || financials.outstandingBalance > 0.01 || financials.totalRepayable <= 0) return "";
  const schedulePaymentDates = (financials.schedule || []).map((row) => row.paymentDate).filter(Boolean).sort();
  const completionDate = schedulePaymentDates.at(-1) || financials.latestPayment?.paymentDate || financials.adjustedDueDate || financials.originalDueDate || beneficiary.financial?.originalDueDate || "";
  return isValidDate(completionDate) ? completionDate : "";
}

export function isRefundArchiveEligible(refundCompletedAt = "", currentDate = todayIso()) {
  if (!isValidDate(refundCompletedAt) || !isValidDate(currentDate)) return false;
  const completionYear = Number(refundCompletedAt.slice(0, 4));
  const archiveEligibleDate = `${completionYear + 1}-01-01`;
  return currentDate >= archiveEligibleDate;
}

export function getRefundMonitoringStatus(beneficiary = {}, financials = getBeneficiaryFinancials(beneficiary.id), currentDate = todayIso()) {
  if (beneficiary.archived || beneficiary.status === "Archived") return "Archived";
  const completionDate = getRefundCompletionDate(beneficiary, financials);
  if (!completionDate) return "Active Refund Monitoring";
  return isRefundArchiveEligible(completionDate, currentDate) ? "Archive Eligible" : "Refund Completed - Monitoring Until Year End";
}

function normalizeBeneficiaryForm(data, existing = {}) {
  const assets = {
    land: toNumber(data.assetLand),
    building: toNumber(data.assetBuilding),
    equipment: toNumber(data.assetEquipment),
    revolvingCapital: toNumber(data.assetRevolvingCapital)
  };
  const services = Array.isArray(data.services)
    ? data.services
        .map((service) => ({
          id: service.id || "",
          category: service.category || "",
          subtype: service.subtype || "",
          dateAvailed: service.dateAvailed || "",
          remarks: service.remarks || ""
        }))
        .filter((service) => service.category)
    : Array.isArray(existing.services)
      ? existing.services
      : [];
  const hasSetup = services.some((service) => service.category === setupCategory) || Boolean(data.projectTitle || data.fundAssistance || data.assistanceAmount);
  const hasActiveSetupPhase = services
    .filter((service) => service.category === setupCategory)
    .some((service) => {
      const phase = parseSetupPhaseRemarks(service.remarks);
      return !phase.archived && ["Ongoing", "Pending", "Returned"].includes(phase.status || "Ongoing");
    });
  const refundStart = data.refundStart || data.repaymentStartDate || "";
  const refundEnd = data.refundEnd || data.originalDueDate || "";
  const numberOfMonths = Number(data.numberOfMonths || data.installments || getRefundMonthCount(refundStart, refundEnd) || 0);
  const projectStatus = data.projectStatus || data.status || existing.setup?.manualStatus || "";
  const sourceOfFund = data.sourceOfFund || (hasSetup ? setupCategory : existing.project?.sourceOfFund || "");
  const assistanceAmount = toNumber(data.fundAssistance ?? data.assistanceAmount);
  const monthlyRefundAmount = toNumber(data.monthlyRefund ?? data.monthlyRefundAmount);
  const age = calculateAge(data.birthDate);
  const district = data.district || getMunicipalityDistrict(data.municipality);
  const enterpriseClassification = getEnterpriseClassification(assets);
  return {
    ...existing,
    id: existing.id || uid("ben"),
    firmName: data.firmName?.trim() || "",
    proprietor: data.cooperatorName?.trim() || data.proprietor?.trim() || "",
    address: data.completeAddress?.trim() || data.address?.trim() || "",
    municipality: data.municipality || "",
    contactNumber: data.contactNumber?.trim() || "",
    email: data.email?.trim() || "",
    notes: data.notes?.trim() || "",
    cooperator: {
      ...(existing.cooperator || {}),
      name: data.cooperatorName?.trim() || data.proprietor?.trim() || "",
      sex: data.sex || "",
      birthDate: data.birthDate || "",
      age,
      isSeniorCitizen: getSeniorCitizenClassification(data.birthDate) === "Yes",
      isPwd: yesNoValue(data.isPwd) === "Yes",
      isIndigenousPeople: yesNoValue(data.isIndigenousPeople) === "Yes",
      contactNumber: data.contactNumber?.trim() || "",
      email: data.email?.trim() || ""
    },
    business: {
      ...(existing.business || {}),
      firmName: data.firmName?.trim() || "",
      completeAddress: data.completeAddress?.trim() || data.address?.trim() || "",
      municipality: data.municipality || "",
      district,
      businessType: data.businessType || "",
      businessSector: data.businessSector || "",
      assets: {
        ...assets,
        total: getAssetTotal(assets)
      },
      enterpriseClassification
    },
    services,
    setup: {
      ...(existing.setup || {}),
      projectTitle: data.projectTitle?.trim() || "",
      yearAwarded: Number(data.yearAwarded || data.projectYear || new Date().getFullYear()),
      assignedProjectOfficer: data.officer?.trim() || data.assignedProjectOfficer?.trim() || "",
      manualStatus: setupStatusValues.has(projectStatus) ? projectStatus : "",
      calculatedStatus: "",
      financial: {
        fundAssistance: assistanceAmount,
        monthlyRefund: monthlyRefundAmount,
        refundStart,
        refundEnd,
        numberOfMonths
      }
    },
    project: {
      title: data.projectTitle?.trim() || "",
      spin: existing.project?.spin || data.spin?.trim() || "",
      projectYear: Number(data.yearAwarded || data.projectYear || new Date().getFullYear()),
      sourceOfFund,
      officer: data.officer?.trim() || data.assignedProjectOfficer?.trim() || "",
      status: data.projectStatus?.trim() || existing.project?.status || ""
    },
    financial: {
      assistanceAmount,
      releaseDate: data.releaseDate || existing.financial?.releaseDate || "",
      projectDurationMonths: Number(data.projectDurationMonths || numberOfMonths || 0),
      repaymentStartDate: refundStart,
      originalDueDate: refundEnd,
      installments: numberOfMonths,
      monthlyRefundAmount,
      technologyTransferFee: toNumber(data.technologyTransferFee),
      optionToBuyAmount: toNumber(data.optionToBuyAmount),
      otherFees: toNumber(data.otherFees),
      remarks: data.initialRemarks?.trim() || ""
    },
    status: hasActiveSetupPhase ? "Not Yet Started" : projectStatus === "Terminated" ? "Terminated" : data.status || existing.status || "Not Yet Started",
    archived: hasActiveSetupPhase ? false : existing.archived || false,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const beneficiaryService = {
  list({ includeArchived = false, asOf = todayIso(), deriveStatus = true } = {}) {
    const state = repository.getSnapshot();
    return state.beneficiaries
      .filter((item) => includeArchived || !item.archived)
      .map((beneficiary) => {
        const financials = getBeneficiaryFinancials(beneficiary.id, asOf);
        return {
          ...beneficiary,
          status: deriveStatus ? deriveAccountStatus(beneficiary, financials, asOf) : beneficiary.status,
          storedStatus: beneficiary.status,
          financials
        };
      });
  },
  get(id) {
    return repository.get("beneficiaries", id);
  },
  getWithFinancials(id) {
    const beneficiary = this.get(id);
    if (!beneficiary) return null;
    const financials = getBeneficiaryFinancials(id);
    return { ...beneficiary, status: deriveAccountStatus(beneficiary, financials), storedStatus: beneficiary.status, financials };
  },
  validate(data, existingId = "") {
    const errors = {};
    if (data.email && !validateEmail(data.email)) errors.email = "Enter a valid email address.";
    if (data.contactNumber && !validatePhone(data.contactNumber)) errors.contactNumber = "Enter a valid contact number.";
    if (data.birthDate && !isValidDate(data.birthDate)) errors.birthDate = "Birthday is invalid.";
    if (data.birthDate && data.birthDate > todayIso()) errors.birthDate = "Birthday cannot be in the future.";
    const age = calculateAge(data.birthDate);
    if (data.birthDate && age === "") errors.birthDate = "Birthday produces an impossible age.";
    if (data.birthDate && age !== "" && Number(age) < 18) errors.birthDate = "Cooperator must be at least 18 years old.";
    ["assetLand", "assetBuilding", "assetEquipment", "assetRevolvingCapital"].forEach((field) => {
      if (toNumber(data[field]) < 0) errors[field] = "Declared asset values cannot be negative.";
    });
    if (data.municipality && !getMunicipalityDistrict(data.municipality)) errors.municipality = "Select a validated Ilocos Sur municipality.";
    const services = Array.isArray(data.services) ? data.services.filter((service) => service.category) : [];
    services.forEach((service, index) => {
      if (serviceSubtypes[service.category]?.length && !service.subtype) {
        errors.services = `Select a subtype for service ${index + 1}.`;
      }
    });
    const hasSetup = services.some((service) => service.category === setupCategory);
    if (hasSetup) {
      const phaseCounts = new Map();
      services
        .filter((service) => service.category === setupCategory)
        .forEach((service, index) => {
          if (!service.subtype) {
            errors.services = `Select a SETUP phase for service ${index + 1}.`;
            return;
          }
          phaseCounts.set(service.subtype, (phaseCounts.get(service.subtype) || 0) + 1);
          const phase = parseSetupPhaseRemarks(service.remarks);
          if (phase.releaseDate && !isValidDate(phase.releaseDate)) errors.services = `${service.subtype} release date is invalid.`;
          if (toNumber(phase.fundAssistance) < 0) errors.services = `${service.subtype} SETUP fund assistance cannot be negative.`;
          if (toNumber(phase.monthlyRefund) < 0) errors.services = `${service.subtype} monthly refund cannot be negative.`;
          if (toNumber(phase.technologyTransferFee) < 0 || toNumber(phase.optionToBuyAmount) < 0 || toNumber(phase.otherFees) < 0) {
            errors.services = `${service.subtype} fees cannot be negative.`;
          }
          if (phase.refundStart && !isValidDate(phase.refundStart)) errors.services = `${service.subtype} monthly refund start is invalid.`;
          if (phase.refundEnd && !isValidDate(phase.refundEnd)) errors.services = `${service.subtype} monthly refund end is invalid.`;
          if (phase.refundEnd && phase.refundStart && !dateAfter(phase.refundEnd, phase.refundStart)) {
            errors.services = `${service.subtype} monthly refund end cannot be before the start date.`;
          }
          if ((phase.refundStart || phase.refundEnd || toNumber(phase.monthlyRefund) > 0) && getRefundMonthCount(phase.refundStart, phase.refundEnd) <= 0) {
            errors.services = `${service.subtype} refund schedule must contain at least one month.`;
          }
        });
      const duplicatePhase = [...phaseCounts.entries()].find(([, count]) => count > 1)?.[0];
      if (duplicatePhase) errors.services = `${duplicatePhase} is already added for this cooperator. Use a different SETUP phase.`;
      if (toNumber(data.fundAssistance) < 0) errors.fundAssistance = "SETUP fund assistance cannot be negative.";
      if (toNumber(data.monthlyRefund) < 0) errors.monthlyRefund = "Monthly refund cannot be negative.";
      if (data.refundEnd && data.refundStart && !dateAfter(data.refundEnd, data.refundStart)) {
        errors.refundEnd = "Monthly refund end cannot be before the start date.";
      }
      if (data.refundStart && data.refundEnd && getRefundMonthCount(data.refundStart, data.refundEnd) <= 0) {
        errors.numberOfMonths = "Refund schedule must contain at least one month.";
      }
    }
    if (data.spin?.trim()) {
      const duplicateSpin = repository
        .list("beneficiaries")
        .find((item) => item.project.spin === data.spin?.trim() && item.id !== existingId);
      if (duplicateSpin) errors.spin = "This legacy project number already exists in current records.";
    }
    return errors;
  },
  async saveFromForm(data, existingId = "") {
    const existing = existingId ? repository.get("beneficiaries", existingId) : {};
    const record = normalizeBeneficiaryForm(data, existing || {});
    const saved = await repository.upsertAsync("beneficiaries", record);
    repository.addActivity({
      id: uid("act"),
      beneficiaryId: saved.id,
      action: existingId ? "Cooperator updated" : "Cooperator created",
      timestamp: new Date().toISOString()
    });
    return saved;
  },
  archive(id) {
    repository.patch("beneficiaries", id, { archived: true, status: "Archived", updatedAt: new Date().toISOString() });
    repository.addActivity({ id: uid("act"), beneficiaryId: id, action: "Record archived", timestamp: new Date().toISOString() });
  },
  async archiveAsync(id, action = "Record archived") {
    const saved = await repository.patchAsync("beneficiaries", id, { archived: true, status: "Archived", updatedAt: new Date().toISOString() });
    if (saved) repository.addActivity({ id: uid("act"), beneficiaryId: id, action, timestamp: new Date().toISOString() });
    return saved;
  },
  restore(id) {
    repository.patch("beneficiaries", id, { archived: false, status: "Under Review", updatedAt: new Date().toISOString() });
    repository.addActivity({ id: uid("act"), beneficiaryId: id, action: "Record restored", timestamp: new Date().toISOString() });
  },
  delete(id) {
    repository.remove("beneficiaries", id);
  }
};

export const collectionService = {
  list({ includeArchived = false } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    return state.payments
      .filter((item) => includeArchived || !item.archived)
      .map((payment) => ({
        ...payment,
        beneficiary: beneficiariesById.get(payment.beneficiaryId)
      }));
  },
  get(id) {
    return this.list({ includeArchived: true }).find((item) => item.id === id) || null;
  },
  getPaymentPhaseContext(beneficiaryId, projectTitle = "") {
    const beneficiary = repository.get("beneficiaries", beneficiaryId);
    if (!beneficiary) return null;
    const cooperator = getCooperatorView(beneficiary, getBeneficiaryFinancials(beneficiaryId));
    const phases = cooperator.setup?.phases || [];
    const selectedTitle = String(projectTitle || "").trim();
    const phase =
      phases.find((item) => setupPhasePaymentKey(item, cooperator) === selectedTitle) ||
      (!selectedTitle ? phases[0] : null) ||
      phases.find((item) => isPhaseOne(item.phase)) ||
      null;
    if (!phase) return { beneficiary, cooperator, phase: null, financials: getBeneficiaryFinancials(beneficiaryId) };
    return {
      beneficiary,
      cooperator,
      phase,
      projectTitle: setupPhasePaymentKey(phase, cooperator),
      financials: getPhaseFinancials({ beneficiary, cooperator, phase })
    };
  },
  buildAllocations(beneficiaryId, amount, projectTitle = "") {
    let remaining = roundCurrency(toNumber(amount));
    if (!beneficiaryId || remaining <= 0) return [];
    const context = this.getPaymentPhaseContext(beneficiaryId, projectTitle);
    const schedule = context?.financials?.schedule || getSchedule(beneficiaryId);
    return schedule
      .filter((item) => Number(item.remainingAmount || 0) > 0.01)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber)
      .map((item) => {
        if (remaining <= 0.01) return null;
        const allocationAmount = roundCurrency(Math.min(Number(item.remainingAmount || 0), remaining));
        remaining = roundCurrency(Math.max(0, remaining - allocationAmount));
        return {
          beneficiaryId,
          installmentNumber: item.installmentNumber,
          amount: allocationAmount
        };
      })
      .filter(Boolean);
  },
  validate(data, allocations = []) {
    const errors = {};
    const amount = toNumber(data.amount);
    if (!data.beneficiaryId) errors.beneficiaryId = "Cooperator is required.";
    if (!data.paymentDate) errors.paymentDate = "Payment date is required.";
    else if (!isValidDate(data.paymentDate)) errors.paymentDate = "Payment date is invalid.";
    else if (data.paymentDate > todayIso()) errors.paymentDate = "Payment date cannot be in the future.";
    if (amount <= 0) errors.amount = "Payment amount must be greater than zero.";
    const duplicate = repository
      .list("payments")
      .find((item) => item.referenceNumber && item.referenceNumber === data.referenceNumber?.trim());
    if (duplicate) errors.referenceNumber = "This payment receipt already exists in current records.";
    const context = data.beneficiaryId ? this.getPaymentPhaseContext(data.beneficiaryId, data.projectTitle) : null;
    const financials = context?.financials || (data.beneficiaryId ? getBeneficiaryFinancials(data.beneficiaryId) : null);
    if (data.beneficiaryId) {
      const phaseCount = context?.cooperator?.setup?.phases?.length || 0;
      if (phaseCount > 1 && !data.projectTitle) errors.projectTitle = "Select the SETUP phase/project for this payment.";
    }
    if (financials && amount - financials.outstandingBalance > 0.01) errors.amount = "Amount paid cannot exceed the total remaining balance.";
    const normalizedAllocations = this.buildAllocations(data.beneficiaryId, amount, data.projectTitle);
    const allocated = normalizedAllocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (amount > 0 && financials && !normalizedAllocations.length) errors.amount = "No unpaid monthly refund balance is available for this payment.";
    else if (amount > 0 && financials && Math.abs(allocated - amount) > 0.01) errors.amount = "Amount paid cannot exceed the total remaining balance.";
    if (financials && allocations.length) {
      const scheduleByInstallment = new Map(financials.schedule.map((item) => [item.installmentNumber, item]));
      for (const allocation of allocations) {
        const installmentNumber = Number(allocation.installmentNumber || 0);
        const scheduleRow = scheduleByInstallment.get(installmentNumber);
        if (!scheduleRow) {
          errors.allocations = "Allocations must reference valid installments.";
          break;
        }
      }
    }
    return errors;
  },
  create(data, allocations = []) {
    const beneficiary = repository.get("beneficiaries", data.beneficiaryId);
    const context = this.getPaymentPhaseContext(data.beneficiaryId, data.projectTitle);
    const normalizedAllocations = this.buildAllocations(data.beneficiaryId, data.amount, data.projectTitle);
    const payment = {
      id: uid("pay"),
      beneficiaryId: data.beneficiaryId,
      projectTitle: context?.projectTitle || data.projectTitle || beneficiary?.project.title || "",
      paymentDate: data.paymentDate,
      amount: toNumber(data.amount),
      method: data.method || "Manual",
      referenceNumber: data.referenceNumber?.trim() || "",
      checkDate: data.checkDate || "",
      bank: data.bank === "Other" ? data.bankOther?.trim() || "" : data.bank?.trim() || "",
      dateReceived: data.dateReceived || data.paymentDate,
      dateDeposited: data.dateDeposited || "",
      status: data.status || "Received",
      allocations: normalizedAllocations.length ? normalizedAllocations : allocations,
      remarks: data.remarks?.trim() || "",
      archived: false
    };
    repository.upsert("payments", payment);
    repository.addActivity({ id: uid("act"), beneficiaryId: payment.beneficiaryId, action: "Payment recorded", timestamp: new Date().toISOString() });
    return payment;
  },
  update(id, data) {
    const existing = repository.get("payments", id);
    if (!existing) return null;
    const normalizedAllocations = this.buildAllocations(existing.beneficiaryId, data.amount, existing.projectTitle);
    const patch = {
      paymentDate: data.paymentDate,
      amount: toNumber(data.amount),
      referenceNumber: data.referenceNumber?.trim() || "",
      allocations: normalizedAllocations.length ? normalizedAllocations : existing.allocations
    };
    repository.patch("payments", id, patch);
    const state = repository.getSnapshot();
    const linkedReceipt = state.receipts.find((item) => item.paymentId === id && !item.archived);
    if (linkedReceipt) {
      const receiptPatch = {
        orNumber: data.referenceNumber?.trim() || linkedReceipt.orNumber,
        orDate: data.paymentDate,
        amount: toNumber(data.amount)
      };
      repository.patch("receipts", linkedReceipt.id, receiptPatch);
    }
    repository.addActivity({ id: uid("act"), beneficiaryId: existing.beneficiaryId, action: "Payment updated", timestamp: new Date().toISOString() });
    return repository.get("payments", id);
  },
  archive(id) {
    repository.patch("payments", id, { archived: true });
  },
  restore(id) {
    repository.patch("payments", id, { archived: false });
  },
  delete(id) {
    repository.remove("payments", id);
  }
};

export const receiptService = {
  list({ includeArchived = false } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    const paymentsById = new Map(state.payments.map((item) => [item.id, item]));
    return state.receipts
      .filter((item) => includeArchived || !item.archived)
      .map((receipt) => {
        const payment = paymentsById.get(receipt.paymentId);
        return {
          ...receipt,
          payment,
          beneficiary: beneficiariesById.get(receipt.beneficiaryId)
        };
      });
  },
  validate(data) {
    const errors = {};
    if (!data.beneficiaryId) errors.beneficiaryId = "Cooperator is required.";
    if (!data.paymentId) errors.paymentId = "Related payment is required.";
    if (!data.orNumber?.trim()) errors.orNumber = "Official receipt number is required.";
    if (!data.orDate) errors.orDate = "Official receipt date is required.";
    else if (!isValidDate(data.orDate)) errors.orDate = "Official receipt date is invalid.";
    if (toNumber(data.amount) <= 0) errors.amount = "Official receipt amount must be greater than zero.";
    const state = repository.getSnapshot();
    const duplicate = state.receipts.find((item) => item.orNumber === data.orNumber?.trim());
    if (duplicate) errors.orNumber = "This official receipt number already exists in current records.";
    const payment = state.payments.find((item) => item.id === data.paymentId);
    if (payment) {
      if (payment.beneficiaryId !== data.beneficiaryId) errors.paymentId = "Selected payment belongs to another cooperator.";
      if (!isActivePayment(payment)) errors.paymentId = "Selected payment is not eligible for an official receipt.";
      if (data.orDate && data.orDate < payment.paymentDate) errors.orDate = "OR date cannot be earlier than payment date.";
      if (state.receipts.some((item) => item.paymentId === data.paymentId)) errors.paymentId = "Selected payment already has an OR.";
    }
    return errors;
  },
  create(data) {
    const receipt = {
      id: uid("or"),
      beneficiaryId: data.beneficiaryId,
      paymentId: data.paymentId,
      orNumber: data.orNumber?.trim() || "",
      orDate: data.orDate,
      amount: toNumber(data.amount),
      penaltyAmount: toNumber(data.penaltyAmount),
      attachmentName: data.attachmentName || "",
      remarks: data.remarks?.trim() || "",
      archived: false
    };
    repository.upsert("receipts", receipt);
    repository.addActivity({ id: uid("act"), beneficiaryId: receipt.beneficiaryId, action: "Official receipt added", timestamp: new Date().toISOString() });
    return receipt;
  },
  archive(id) {
    repository.patch("receipts", id, { archived: true });
  },
  restore(id) {
    repository.patch("receipts", id, { archived: false });
  },
  delete(id) {
    repository.remove("receipts", id);
  }
};

export const reconciliationService = {
  list({ beneficiaryIds = null, asOf = "" } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    const receiptsByPaymentId = new Map(
      state.receipts
        .filter((item) => !item.archived && (!asOf || item.orDate <= asOf))
        .map((item) => [item.paymentId, item])
    );
    const receiptNumberCounts = state.receipts.reduce((map, receipt) => {
      if (!receipt.archived && (!asOf || receipt.orDate <= asOf)) map.set(receipt.orNumber, (map.get(receipt.orNumber) || 0) + 1);
      return map;
    }, new Map());
    return state.payments
      .filter((payment) => isActivePayment(payment, asOf) && (!beneficiaryIds || beneficiaryIds.has(payment.beneficiaryId)))
      .map((payment) => {
        const beneficiary = beneficiariesById.get(payment.beneficiaryId);
        const receipt = receiptsByPaymentId.get(payment.id);
        let status = "Matched";
        if (!receipt) status = "Missing OR";
        else if (receiptNumberCounts.get(receipt.orNumber) > 1) status = "Duplicate OR";
        else if (Math.abs(Number(receipt.amount || 0) - Number(payment.amount || 0)) > 0.01) status = "Amount Mismatch";
        return {
          id: `rec-${payment.id}`,
          beneficiary,
          payment,
          receipt,
          difference: receipt ? Number(receipt.amount || 0) - Number(payment.amount || 0) : -Number(payment.amount || 0),
          status
        };
      });
  }
};

export const defermentService = {
  list({ includeArchived = false } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    return state.deferments
      .filter((item) => includeArchived || !item.archived)
      .map((item) => ({ ...item, beneficiary: beneficiariesById.get(item.beneficiaryId) }));
  },
  validate(data) {
    const errors = {};
    if (!data.beneficiaryId) errors.beneficiaryId = "Cooperator is required.";
    if (!data.requestDate) errors.requestDate = "Request date is required.";
    else if (!isValidDate(data.requestDate)) errors.requestDate = "Request date is invalid.";
    if (!data.startDate) errors.startDate = "Start date is required.";
    else if (!isValidDate(data.startDate)) errors.startDate = "Start date is invalid.";
    if (!data.endDate) errors.endDate = "End date is required.";
    else if (!isValidDate(data.endDate)) errors.endDate = "End date is invalid.";
    if (!errors.startDate && !errors.endDate && data.startDate && data.endDate && !dateAfter(data.endDate, data.startDate)) errors.endDate = "End date must be after start date.";
    if (Number(data.months || 0) <= 0) errors.months = "Deferred months must be greater than zero.";
    if (!data.reason?.trim()) errors.reason = "Reason is required.";
    return errors;
  },
  create(data) {
    const deferment = {
      id: uid("def"),
      beneficiaryId: data.beneficiaryId,
      requestDate: data.requestDate,
      startDate: data.startDate,
      endDate: data.endDate,
      months: Number(data.months || 0),
      reason: data.reason?.trim() || "",
      approvalDate: data.approvalDate || "",
      approvedBy: data.approvedBy?.trim() || "",
      status: data.status || "Pending Documentation",
      remarks: data.remarks?.trim() || "",
      archived: false
    };
    repository.upsert("deferments", deferment);
    if (deferment.status === "Approved Externally") repository.patch("beneficiaries", deferment.beneficiaryId, { status: "Deferred" });
    repository.addActivity({ id: uid("act"), beneficiaryId: deferment.beneficiaryId, action: "Deferment recorded", timestamp: new Date().toISOString() });
    return deferment;
  },
  archive(id) {
    repository.patch("deferments", id, { archived: true });
  },
  restore(id) {
    repository.patch("deferments", id, { archived: false });
  },
  delete(id) {
    repository.remove("deferments", id);
  }
};

export const adjustmentService = {
  list({ includeArchived = false } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    return state.adjustments
      .filter((item) => includeArchived || !item.archived)
      .map((item) => ({ ...item, beneficiary: beneficiariesById.get(item.beneficiaryId) }));
  },
  validate(data) {
    const errors = {};
    if (!data.beneficiaryId) errors.beneficiaryId = "Cooperator is required.";
    if (!data.type) errors.type = "Adjustment type is required.";
    if (!data.effectiveDate) errors.effectiveDate = "Effective date is required.";
    else if (!isValidDate(data.effectiveDate)) errors.effectiveDate = "Effective date is invalid.";
    if (toNumber(data.amount) < 0) errors.amount = "Amount cannot be negative.";
    if (!data.reason?.trim()) errors.reason = "Reason is required.";
    return errors;
  },
  create(data) {
    const adjustment = {
      id: uid("adj"),
      beneficiaryId: data.beneficiaryId,
      type: data.type,
      effectiveDate: data.effectiveDate,
      amount: toNumber(data.amount),
      previousValue: data.previousValue?.trim() || "",
      newValue: data.newValue?.trim() || "",
      reason: data.reason?.trim() || "",
      approvedBy: data.approvedBy?.trim() || "",
      remarks: data.remarks?.trim() || "",
      archived: false
    };
    repository.upsert("adjustments", adjustment);
    repository.addActivity({ id: uid("act"), beneficiaryId: adjustment.beneficiaryId, action: "Adjustment created", timestamp: new Date().toISOString() });
    return adjustment;
  },
  archive(id) {
    repository.patch("adjustments", id, { archived: true });
  },
  restore(id) {
    repository.patch("adjustments", id, { archived: false });
  },
  delete(id) {
    repository.remove("adjustments", id);
  }
};

export const documentService = {
  list({ includeArchived = false } = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById } = getStateIndexes(state);
    return state.documents
      .filter((item) => includeArchived || !item.archived)
      .map((item) => ({ ...item, beneficiary: beneficiariesById.get(item.beneficiaryId) }));
  },
  validateFile(file) {
    if (!file) return "Select a file to upload.";
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return "Unsupported file. Use PDF, JPG, PNG, or WebP.";
    if (file.size > 10 * 1024 * 1024) return "File is larger than the 10 MB frontend limit.";
    return "";
  },
  async create(data, file) {
    const beneficiary = repository.get("beneficiaries", data.beneficiaryId);
    const record = {
      id: uid("doc"),
      category: data.category,
      beneficiaryId: data.beneficiaryId,
      projectTitle: beneficiary?.project.title || "",
      relatedTransaction: data.relatedTransaction?.trim() || "",
      documentDate: data.documentDate || todayIso(),
      fileName: file?.name || data.fileName || "document.pdf",
      fileSize: file?.size || 0,
      fileType: file?.type || "application/pdf",
      storagePath: "",
      description: data.description?.trim() || "",
      archived: false
    };
    record.storagePath = await repository.uploadDocumentFile(record, file);
    repository.upsert("documents", record);
    return record;
  },
  archive(id) {
    repository.patch("documents", id, { archived: true });
  },
  restore(id) {
    repository.patch("documents", id, { archived: false });
  },
  delete(id) {
    repository.remove("documents", id);
  }
};

export function normalizeSalesReportingMonth(value = "") {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text.slice(0, 7)}-01`;
  return "";
}

function salesMonthKey(value = "") {
  return normalizeSalesReportingMonth(value).slice(0, 7);
}

function salesMonthLabel(value = "") {
  const month = Number(salesMonthKey(value).slice(5, 7));
  return month ? new Date(2026, month - 1, 1).toLocaleDateString("en-PH", { month: "short" }).toUpperCase() : "NO MONTH";
}

function normalizeSalesBusinessSector(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || /^(n\/a|na|none|null|undefined|not provided|not classified)$/i.test(text)) return "Not classified";
  return text
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getEmployeeFullName(employee = {}) {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || employee.employeeCode || "Not assigned";
}

function normalizeEmploymentStatus(value = "") {
  const text = String(value || "").trim();
  return lookups.employmentStatuses.includes(text) ? text : "Active";
}

function nextEmployeeCode(extraCodes = []) {
  const codes = [...repository.list("employees").map((item) => item.employeeCode), ...extraCodes].filter(Boolean);
  const max = codes.reduce((highest, code) => {
    const match = String(code).match(/EMP-(\d+)/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

export const employeeService = {
  nextCode(extraCodes = []) {
    return nextEmployeeCode(extraCodes);
  },
  list({ includeArchived = false, status = "", position = "" } = {}) {
    return repository
      .list("employees")
      .filter((item) => includeArchived || !item.archived)
      .filter((item) => !status || item.employmentStatus === status)
      .filter((item) => !position || item.position === position)
      .sort((a, b) => getEmployeeFullName(a).localeCompare(getEmployeeFullName(b)));
  },
  get(id) {
    return repository.get("employees", id);
  },
  validate(data, existingId = "") {
    const errors = {};
    if (!String(data.firstName || "").trim()) errors.firstName = "First name is required.";
    if (!String(data.lastName || "").trim()) errors.lastName = "Last name is required.";
    if (data.email && !validateEmail(data.email)) errors.email = "Enter a valid email address.";
    if (data.contactNumber && !validatePhone(data.contactNumber)) errors.contactNumber = "Enter a valid contact number.";
    if (data.employeeCode?.trim()) {
      const duplicate = repository.list("employees").find((item) => item.employeeCode === data.employeeCode.trim() && item.id !== existingId);
      if (duplicate) errors.employeeCode = "This employee code already exists.";
    }
    return errors;
  },
  async save(data, existingId = "") {
    const existing = existingId ? repository.get("employees", existingId) : {};
    const record = {
      id: existing?.id || uid("emp"),
      employeeCode: String(data.employeeCode || existing?.employeeCode || nextEmployeeCode()).trim(),
      firstName: String(data.firstName || "").trim(),
      lastName: String(data.lastName || "").trim(),
      address: String(data.address || "").trim(),
      contactNumber: String(data.contactNumber || "").trim(),
      email: String(data.email || "").trim(),
      position: String(data.position || "").trim(),
      employmentStatus: normalizeEmploymentStatus(data.employmentStatus),
      remarks: String(data.remarks || "").trim(),
      archived: existing?.archived || false,
      createdBy: existing?.createdBy || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = await repository.upsertAsync("employees", record);
    repository.addActivity({ id: uid("act"), beneficiaryId: "", action: existingId ? "Employee updated" : "Employee added", timestamp: new Date().toISOString() });
    return saved;
  },
  archive(id) {
    repository.patch("employees", id, { archived: true, updatedAt: new Date().toISOString() });
  },
  restore(id) {
    repository.patch("employees", id, { archived: false, updatedAt: new Date().toISOString() });
  },
  delete(id) {
    repository.remove("employees", id);
  },
  summary(records = this.list()) {
    const byStatus = new Map();
    const byPosition = new Map();
    records.forEach((employee) => {
      pushGrouped(byStatus, employee.employmentStatus);
      pushGrouped(byPosition, employee.position || "Not specified");
    });
    return {
      total: records.length,
      active: records.filter((item) => item.employmentStatus === "Active").length,
      archived: this.list({ includeArchived: true }).filter((item) => item.archived).length,
      byStatus: groupedRows(byStatus),
      byPosition: groupedRows(byPosition)
    };
  }
};

function salesPerformance(actual, benchmark) {
  return benchmark > 0 ? percent(actual, benchmark) : 0;
}

function salesVariance(actual, benchmark) {
  return roundCurrency(Number(actual || 0) - Number(benchmark || 0));
}

function additionalJobs(before, after) {
  return Number(after || 0) - Number(before || 0);
}

function employmentGrowth(before, after) {
  const baseline = Number(before || 0);
  const added = additionalJobs(before, after);
  if (baseline <= 0) return added > 0 ? 100 : 0;
  return percent(added, baseline);
}

function salesFirmKey(record = {}) {
  if (record.cooperatorId) return `cooperator:${record.cooperatorId}`;
  return `firm:${String(record.firmName || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function salesRecordWithComputed(record, beneficiariesById, employeesById = new Map()) {
  const beneficiary = beneficiariesById.get(record.cooperatorId);
  const employee = employeesById.get(record.assignedEmployeeId);
  const firmName = record.firmName || (beneficiary ? getCooperatorView(beneficiary).firmName : "Not provided");
  const businessSector = normalizeSalesBusinessSector(beneficiary?.business?.businessSector || "");
  return {
    ...record,
    firmName,
    firmKey: salesFirmKey({ ...record, firmName }),
    beneficiary,
    employee,
    employeeName: employee ? getEmployeeFullName(employee) : "Not assigned",
    employeePosition: employee?.position || "",
    employmentStatus: employee?.employmentStatus || "",
    businessSector,
    municipality: beneficiary?.business?.municipality || beneficiary?.municipality || "",
    projectYear: beneficiary?.project?.projectYear || "",
    variance: salesVariance(record.grossSales, record.benchmarkMonthlyGrossSales),
    performance: salesPerformance(record.grossSales, record.benchmarkMonthlyGrossSales),
    additionalJobs: additionalJobs(record.jobsGeneratedBefore, record.jobsGeneratedAfter),
    employmentGrowth: employmentGrowth(record.jobsGeneratedBefore, record.jobsGeneratedAfter),
    monthKey: salesMonthKey(record.reportingMonth),
    monthLabel: salesMonthLabel(record.reportingMonth)
  };
}

function salesFilterMatches(record, filters = {}) {
  if (filters.assistanceYear && String(record.assistanceYear) !== String(filters.assistanceYear)) return false;
  if (filters.reportingMonth && record.monthKey !== String(filters.reportingMonth).slice(0, 7)) return false;
  if (filters.assignedStaff && record.assignedStaff !== filters.assignedStaff) return false;
  if (filters.cooperatorId && record.cooperatorId !== filters.cooperatorId) return false;
  if (filters.firmKey && record.firmKey !== filters.firmKey) return false;
  if (filters.businessSector && record.businessSector !== filters.businessSector) return false;
  if (filters.municipality && record.municipality !== filters.municipality) return false;
  if (filters.projectYear && String(record.projectYear) !== String(filters.projectYear)) return false;
  if (filters.employmentStatus && record.employmentStatus !== filters.employmentStatus) return false;
  if (filters.position && record.employeePosition !== filters.position) return false;
  return true;
}

export const salesMonitoringService = {
  list(filters = {}) {
    const state = repository.getSnapshot();
    const { beneficiariesById, employeesById } = getStateIndexes(state);
    return (state.salesMonitoring || [])
      .filter((item) => filters.includeArchived || !item.archived)
      .map((item) => salesRecordWithComputed(item, beneficiariesById, employeesById))
      .filter((item) => salesFilterMatches(item, filters))
      .sort((a, b) => b.reportingMonth.localeCompare(a.reportingMonth) || a.firmName.localeCompare(b.firmName));
  },
  get(id) {
    return repository.get("salesMonitoring", id);
  },
  validate(data, existingId = "") {
    const errors = {};
    const reportingMonth = normalizeSalesReportingMonth(data.reportingMonth);
    const firmName = String(data.firmName || "").trim();
    if (!data.cooperatorId && !firmName) errors.cooperatorId = "Select a cooperator or enter a firm name.";
    if (!String(data.assignedStaff || "").trim()) errors.assignedStaff = "Assigned staff is required.";
    if (!String(data.assistanceYear || "").trim()) errors.assistanceYear = "Assistance year is required.";
    if (!reportingMonth) errors.reportingMonth = "Reporting month is required.";
    if (toNumber(data.benchmarkMonthlyGrossSales) < 0) errors.benchmarkMonthlyGrossSales = "Benchmark monthly gross sales cannot be negative.";
    if (toNumber(data.grossSales) < 0) errors.grossSales = "Gross sales cannot be negative.";
    if (toNumber(data.jobsGeneratedBefore) < 0) errors.jobsGeneratedBefore = "Jobs before cannot be negative.";
    if (toNumber(data.jobsGeneratedAfter) < 0) errors.jobsGeneratedAfter = "Jobs after cannot be negative.";
    if (toNumber(data.monthlyTotalProductionCost) < 0) errors.monthlyTotalProductionCost = "Monthly total production cost cannot be negative.";
    if (toNumber(data.productionCostPercentage) < 0) errors.productionCostPercentage = "Production cost percentage cannot be negative.";
    if (toNumber(data.initialProductivity) < 0) errors.initialProductivity = "Initial productivity cannot be negative.";
    const normalizedFirm = firmName.toLowerCase().replace(/\s+/g, " ");
    const duplicate = repository
      .list("salesMonitoring")
      .filter((item) => !item.archived && item.id !== existingId)
      .find((item) => {
        if (normalizeSalesReportingMonth(item.reportingMonth) !== reportingMonth) return false;
        if (data.cooperatorId) {
          if (data.assignedEmployeeId) return item.cooperatorId === data.cooperatorId && item.assignedEmployeeId === data.assignedEmployeeId;
          return item.cooperatorId === data.cooperatorId && !item.assignedEmployeeId;
        }
        return String(item.firmName || "").trim().toLowerCase().replace(/\s+/g, " ") === normalizedFirm;
      });
    if (duplicate) errors.reportingMonth = "This firm already has a sales monitoring record for the selected month.";
    return errors;
  },
  async save(data, existingId = "") {
    const existing = existingId ? repository.get("salesMonitoring", existingId) : {};
    const beneficiary = data.cooperatorId ? repository.get("beneficiaries", data.cooperatorId) : null;
    const firmName = beneficiary ? getCooperatorView(beneficiary).firmName : String(data.firmName || existing.firmName || "").trim();
    const record = {
      id: existing?.id || uid("sales"),
      cooperatorId: data.cooperatorId || "",
      assignedStaff: String(data.assignedStaff || "").trim(),
      assistanceYear: Number(data.assistanceYear || new Date().getFullYear()),
      firmName,
      reportingMonth: normalizeSalesReportingMonth(data.reportingMonth),
      benchmarkMonthlyGrossSales: roundCurrency(toNumber(data.benchmarkMonthlyGrossSales)),
      grossSales: roundCurrency(toNumber(data.grossSales)),
      jobsGeneratedBefore: Number(toNumber(data.jobsGeneratedBefore)),
      jobsGeneratedAfter: Number(toNumber(data.jobsGeneratedAfter)),
      assignedEmployeeId: data.assignedEmployeeId || "",
      monthlyTotalProductionCost: roundCurrency(toNumber(data.monthlyTotalProductionCost)),
      productionCostPercentage: Number(toNumber(data.productionCostPercentage)),
      initialProductivity: Number(toNumber(data.initialProductivity)),
      remarks: String(data.remarks || "").trim(),
      archived: existing?.archived || false,
      createdBy: existing?.createdBy || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = await repository.upsertAsync("salesMonitoring", record);
    repository.addActivity({ id: uid("act"), beneficiaryId: record.cooperatorId, action: existingId ? "Sales monitoring updated" : "Sales monitoring added", timestamp: new Date().toISOString() });
    return saved;
  },
  archive(id) {
    repository.patch("salesMonitoring", id, { archived: true, updatedAt: new Date().toISOString() });
  },
  restore(id) {
    repository.patch("salesMonitoring", id, { archived: false, updatedAt: new Date().toISOString() });
  },
  delete(id) {
    repository.remove("salesMonitoring", id);
  },
  monthlyRows(records) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      const rows = records.filter((record) => record.monthKey.endsWith(`-${month}`));
      const benchmark = roundCurrency(rows.reduce((sum, item) => sum + Number(item.benchmarkMonthlyGrossSales || 0), 0));
      const actual = roundCurrency(rows.reduce((sum, item) => sum + Number(item.grossSales || 0), 0));
      return { label: monthName(index).toUpperCase(), benchmark, actual, performance: salesPerformance(actual, benchmark) };
    });
  },
  employmentMonthlyRows(records) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      const rows = records.filter((record) => record.monthKey.endsWith(`-${month}`));
      const before = rows.reduce((sum, item) => sum + Number(item.jobsGeneratedBefore || 0), 0);
      const after = rows.reduce((sum, item) => sum + Number(item.jobsGeneratedAfter || 0), 0);
      return { label: monthName(index).toUpperCase(), before, after, additional: additionalJobs(before, after), growth: employmentGrowth(before, after) };
    });
  },
  sectorRows(records) {
    const map = new Map();
    records.forEach((record) => {
      const row = map.get(record.businessSector) || { label: record.businessSector, benchmark: 0, actual: 0 };
      row.benchmark += Number(record.benchmarkMonthlyGrossSales || 0);
      row.actual += Number(record.grossSales || 0);
      map.set(record.businessSector, row);
    });
    return [...map.values()]
      .map((row) => ({ ...row, benchmark: roundCurrency(row.benchmark), actual: roundCurrency(row.actual), performance: salesPerformance(row.actual, row.benchmark) }))
      .sort((a, b) => b.actual - a.actual || a.label.localeCompare(b.label));
  },
  summary(records) {
    const benchmark = roundCurrency(records.reduce((sum, item) => sum + Number(item.benchmarkMonthlyGrossSales || 0), 0));
    const actual = roundCurrency(records.reduce((sum, item) => sum + Number(item.grossSales || 0), 0));
    const monthlyRows = this.monthlyRows(records);
    const withActual = monthlyRows.filter((item) => item.benchmark || item.actual);
    const sortedByPerformance = [...withActual].sort((a, b) => b.performance - a.performance);
    const firmKeys = new Set(records.map((item) => item.cooperatorId || String(item.firmName || "").trim().toLowerCase()).filter(Boolean));
    return {
      benchmark,
      actual,
      performance: salesPerformance(actual, benchmark),
      firmsMonitored: firmKeys.size,
      bestMonth: sortedByPerformance[0]?.label || "Not set",
      lowestMonth: sortedByPerformance.at(-1)?.label || "Not set"
    };
  },
  employmentSummary(records) {
    const before = records.reduce((sum, item) => sum + Number(item.jobsGeneratedBefore || 0), 0);
    const after = records.reduce((sum, item) => sum + Number(item.jobsGeneratedAfter || 0), 0);
    const additional = additionalJobs(before, after);
    const productionCost = roundCurrency(records.reduce((sum, item) => sum + Number(item.monthlyTotalProductionCost || 0), 0));
    const costRows = records.filter((item) => Number(item.productionCostPercentage || 0) > 0);
    const productivityRows = records.filter((item) => Number(item.initialProductivity || 0) > 0);
    return {
      jobsBefore: before,
      jobsAfter: after,
      additionalJobs: additional,
      employmentGrowth: employmentGrowth(before, after),
      firmsIncreased: records.filter((item) => Number(item.jobsGeneratedAfter || 0) > Number(item.jobsGeneratedBefore || 0)).length,
      firmsNoIncrease: records.filter((item) => Number(item.jobsGeneratedAfter || 0) <= Number(item.jobsGeneratedBefore || 0)).length,
      totalMonthlyProductionCost: productionCost,
      averageProductionCostPercentage: costRows.length ? costRows.reduce((sum, item) => sum + Number(item.productionCostPercentage || 0), 0) / costRows.length : 0,
      averageInitialProductivity: productivityRows.length ? productivityRows.reduce((sum, item) => sum + Number(item.initialProductivity || 0), 0) / productivityRows.length : 0
    };
  }
};

function pushGrouped(map, label, value = 1) {
  const key = label || "Not classified";
  map.set(key, roundCurrency((map.get(key) || 0) + Number(value || 0)));
}

function normalizedDistrictLabel(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("1") || text.includes("first")) return "First District";
  if (text.includes("2") || text.includes("second")) return "Second District";
  return "No District";
}

function normalizedSetupStatus(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("complete") || text.includes("fully paid")) return "Completed";
  if (text.includes("terminat") || text.includes("withdraw")) return "Terminated";
  if (text.includes("defer")) return "Deferred";
  if (text.includes("review")) return "Under Review";
  return "Ongoing";
}

function groupedRows(map) {
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function setupFilterMatches(beneficiary, cooperator, filters, setupStatus) {
  const phases = cooperator.setup.phases || [];
  if (filters.cooperatorId && beneficiary.id !== filters.cooperatorId) return false;
  if (filters.municipality && cooperator.municipality !== filters.municipality) return false;
  if (filters.district && cooperator.district !== filters.district) return false;
  if (filters.businessSector && cooperator.businessSector !== filters.businessSector) return false;
  if (filters.phase && !phases.some((phase) => phase.phase === filters.phase)) return false;
  if (filters.officer && cooperator.setup.assignedProjectOfficer !== filters.officer && !phases.some((phase) => phase.officer === filters.officer)) return false;
  if (filters.projectStatus && setupStatus.status !== filters.projectStatus && !phases.some((phase) => phase.status === filters.projectStatus)) return false;
  if (filters.year && String(cooperator.setup.yearAwarded) !== String(filters.year) && !phases.some((phase) => String(phase.yearAwarded) === String(filters.year))) return false;
  return hasSetupService(beneficiary);
}

function getSetupRecords(filters = {}, { includeArchived = false } = {}) {
  const asOf = filters.asOf || todayIso();
  return beneficiaryService
    .list({ asOf, includeArchived })
    .map((beneficiary) => {
      const cooperator = getCooperatorView(beneficiary, beneficiary.financials, asOf);
      const setupStatus = deriveSetupProjectStatus(beneficiary, beneficiary.financials, asOf);
      return { beneficiary, cooperator, setupStatus, financials: beneficiary.financials };
    })
    .filter(({ beneficiary, cooperator, setupStatus }) => (includeArchived || !beneficiary.archived) && setupFilterMatches(beneficiary, cooperator, filters, setupStatus));
}

function setupProjectRowsForRecord(record, filters = {}) {
  const phases = record.cooperator.setup.phases || [];
  return phases
    .filter((phase) => {
      if (isPhaseArchived(phase) && filters.projectStatus !== "Archived") return false;
      if (filters.phase && phase.phase !== filters.phase) return false;
      if (filters.officer && phase.officer !== filters.officer) return false;
      if (filters.projectStatus && phase.status !== filters.projectStatus) return false;
      if (filters.year && String(phase.yearAwarded) !== String(filters.year)) return false;
      return true;
    })
    .map((phase) => ({
      ...record,
      phase,
      phaseStatus: phase.status || (isPhaseOne(phase.phase) ? record.setupStatus.status : "Pending"),
      financials: getPhaseFinancials({ beneficiary: record.beneficiary, cooperator: record.cooperator, phase, asOf: filters.asOf || todayIso() }),
      refundApplicable: phaseHasRefundScheme(phase)
    }));
}

function validCollectionPayments(state, beneficiaryIds, dateFrom, dateTo, asOf) {
  return state.payments.filter((payment) => {
    if (!beneficiaryIds.has(payment.beneficiaryId)) return false;
    if (!isActivePayment(payment, asOf)) return false;
    if (dateFrom && payment.paymentDate < dateFrom) return false;
    if (dateTo && payment.paymentDate > dateTo) return false;
    return validPaymentStatuses.has(payment.status) || payment.status === "Received";
  });
}

function completeMonthRange(keys) {
  const clean = [...new Set(keys.filter(Boolean))].sort();
  if (!clean.length) return [];
  const months = [];
  for (let key = clean[0]; key <= clean.at(-1); key = addMonthKey(key, 1)) {
    months.push(key);
  }
  return months;
}

function getExpectedDueAsOf(financials = {}, asOf = todayIso()) {
  const asOfMonth = monthKey(asOf);
  return roundCurrency(
    (financials.schedule || [])
      .filter((row) => row.status !== "Deferred")
      .filter((row) => monthKey(row.dueDate) <= asOfMonth)
      .reduce((sum, row) => sum + Number(row.expectedAmount || 0), 0)
  );
}

function getPaymentStanding({ financials = {}, cooperator = {}, phase = {}, asOf = todayIso() }) {
  const totalFund = roundCurrency(Number(financials.totalRepayable || phase.fundAssistance || cooperator.setup?.financial?.fundAssistance || 0));
  const totalPaid = roundCurrency(Number(financials.totalPaid || 0));
  const expectedDueAsOf = roundCurrency(Math.min(totalFund || Number.MAX_SAFE_INTEGER, getExpectedDueAsOf(financials, asOf)));
  const remainingDueThisMonth = roundCurrency(Math.max(0, expectedDueAsOf - totalPaid));
  const advancePayment = roundCurrency(Math.max(0, Math.min(totalPaid, totalFund || totalPaid) - expectedDueAsOf));
  const remainingBalance = roundCurrency(Math.max(0, totalFund - totalPaid));
  const overpayment = roundCurrency(Math.max(0, totalPaid - totalFund));
  const paymentPercentage = totalFund > 0 ? percent(Math.min(totalPaid, totalFund), totalFund) : 0;
  const hasDueThisMonth = (financials.schedule || []).some((row) => row.status !== "Deferred" && monthKey(row.dueDate) === monthKey(asOf));
  let status = "No Payment Yet";
  if (totalFund > 0 && totalPaid >= totalFund) status = "Fully Paid";
  else if (Number(financials.pastDue || 0) > 0.01) status = "Overdue / Delinquent";
  else if (advancePayment > 0.01) status = "Advance Payment";
  else if (remainingDueThisMonth > 0.01 && totalPaid > 0.01) status = "Partially Paid This Month";
  else if (remainingDueThisMonth > 0.01 && hasDueThisMonth) status = "Due This Month";
  else if (expectedDueAsOf > 0.01 && remainingDueThisMonth <= 0.01) status = "Paid for This Month";
  return {
    totalFund,
    monthlyRefund: roundCurrency(Number(phase.monthlyRefund || financials.schedule?.[0]?.expectedAmount || cooperator.setup?.financial?.monthlyRefund || 0)),
    expectedDueAsOf,
    totalPaid,
    remainingDueThisMonth,
    advancePayment,
    overpayment,
    remainingBalance,
    paymentPercentage,
    status
  };
}

function setupPaymentAnalyticsRows(records, asOf = todayIso()) {
  const unique = new Map();
  records.forEach(({ beneficiary, cooperator, financials, phase, phaseStatus }) => {
    const key = `${beneficiary?.id || ""}:${setupPhasePaymentKey(phase, cooperator)}`;
    if (!beneficiary?.id || unique.has(key)) return;
    const standing = getPaymentStanding({ financials, cooperator, phase, asOf });
    unique.set(key, {
      id: key,
      beneficiaryId: beneficiary.id,
      firmName: cooperator.firmName,
      cooperatorName: cooperator.cooperatorName,
      projectPhase: setupPhasePaymentKey(phase, cooperator),
      phaseStatus,
      ...standing,
      searchText: `${cooperator.firmName} ${cooperator.cooperatorName} ${phase.projectTitle || ""} ${phase.phase || ""} ${standing.status}`
    });
  });
  return [...unique.values()].sort((a, b) => b.remainingDueThisMonth - a.remainingDueThisMonth || a.firmName.localeCompare(b.firmName));
}

function setupPaymentAnalytics(records, asOf = todayIso()) {
  const rows = setupPaymentAnalyticsRows(records, asOf);
  const totals = rows.reduce(
    (summary, row) => {
      summary.totalFund += row.totalFund;
      summary.totalPaid += row.totalPaid;
      summary.expectedDueAsOf += row.expectedDueAsOf;
      summary.remainingDueThisMonth += row.remainingDueThisMonth;
      summary.advancePayment += row.advancePayment;
      summary.overpayment += row.overpayment;
      summary.remainingBalance += row.remainingBalance;
      return summary;
    },
    { totalFund: 0, totalPaid: 0, expectedDueAsOf: 0, remainingDueThisMonth: 0, advancePayment: 0, overpayment: 0, remainingBalance: 0 }
  );
  return {
    asOf,
    ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundCurrency(value)])),
    paymentPercentage: totals.totalFund > 0 ? percent(Math.min(totals.totalPaid, totals.totalFund), totals.totalFund) : 0,
    rows
  };
}

const inactiveRefundPhaseStatuses = new Set(["Completed", "Terminated", "Cancelled", "Returned", "Archived", "Withdrawn"]);

function isActiveSetupRefundRecord({ phase = {}, phaseStatus = "", financials = {} } = {}) {
  if (isPhaseArchived(phase)) return false;
  const status = phaseStatus || phase.status || "";
  if (inactiveRefundPhaseStatuses.has(status)) return false;
  // Active SETUP Refund is balance-based: a phase with an unpaid repayable amount is active even if its monthly schedule data is incomplete.
  return Number(financials.totalRepayable || 0) > 0 && Number(financials.outstandingBalance || 0) > 0.01;
}

function targetCollectionRows(activeRecords, state, selectedYear, asOf) {
  const targetByMonth = new Map();
  activeRecords.forEach(({ financials }) => {
    (financials.schedule || []).forEach((row) => {
      if (!row.dueDate || row.status === "Deferred") return;
      const key = monthKey(row.dueDate);
      targetByMonth.set(key, (targetByMonth.get(key) || 0) + Number(row.expectedAmount || 0));
    });
  });
  const actualByMonth = new Map();
  activeRecords.forEach(({ beneficiary, cooperator, phase }) => {
    phasePayments(state, beneficiary, cooperator, phase, asOf).forEach((payment) => {
      const key = monthKey(payment.paymentDate);
      if (!key) return;
      actualByMonth.set(key, (actualByMonth.get(key) || 0) + Number(payment.amount || 0));
    });
  });
  const filterYear = selectedYear ? String(selectedYear) : "";
  const actualKeys = [...actualByMonth.keys()].filter((key) => !asOf || key <= monthKey(asOf));
  const keys = completeMonthRange([...targetByMonth.keys(), ...actualKeys]).filter((key) => !filterYear || key.startsWith(`${filterYear}-`));
  return keys.map((key, index) => {
    const target = roundCurrency(targetByMonth.get(key) || 0);
    const actual = roundCurrency(actualByMonth.get(key) || 0);
    const month = Number(key.slice(5, 7));
    const year = key.slice(0, 4);
    const label = monthYearLabel(key);
    const compactAllYearsLabel = `${monthName(month - 1)} '${year.slice(2)}`;
    const shortLabel = filterYear
      ? monthName(month - 1)
      : index === 0
        ? compactAllYearsLabel
        : month === 1
          ? year
          : "";
    return {
      label,
      displayLabel: label,
      shortLabel,
      tickAnchor: !filterYear && index === 0 ? "end" : !filterYear && month === 1 ? "start" : "middle",
      month,
      monthKey: key,
      periodStart: `${key}-01`,
      periodEnd: addMonths(`${key}-01`, 1),
      target,
      actual,
      rate: target > 0 ? percent(actual, target) : 0,
      noTarget: target <= 0
    };
  });
}

export const dashboardService = {
  getSystemOverview(filters = {}) {
    const asOf = filters.asOf || todayIso();
    const cooperators = beneficiaryService.list({ asOf }).map((beneficiary) => ({
      beneficiary,
      cooperator: getCooperatorView(beneficiary, beneficiary.financials, asOf),
      setupStatus: deriveSetupProjectStatus(beneficiary, beneficiary.financials, asOf)
    }));
    const active = cooperators.filter(({ beneficiary }) => !beneficiary.archived);
    const byBusinessSector = new Map();
    const byDistrict = new Map();
    const byServiceCategory = new Map();
    const bySetupStatus = new Map();
    const byEnterpriseClassification = new Map();
    const byDemographic = new Map([
      ["Senior Citizen", 0],
      ["PWD", 0],
      ["Indigenous People", 0]
    ]);
    active.forEach(({ beneficiary, cooperator, setupStatus }) => {
      pushGrouped(byBusinessSector, cooperator.businessSector);
      pushGrouped(byDistrict, normalizedDistrictLabel(cooperator.district));
      pushGrouped(byEnterpriseClassification, cooperator.enterpriseClassification || "Not yet classified");
      cooperator.services.forEach((service) => pushGrouped(byServiceCategory, service.category));
      if (hasSetupService(beneficiary)) {
        const phases = cooperator.setup.phases.filter((phase) => !isPhaseArchived(phase));
        if (phases.length) phases.forEach((phase) => pushGrouped(bySetupStatus, normalizedSetupStatus(phase.status || setupStatus.status)));
        else pushGrouped(bySetupStatus, normalizedSetupStatus(setupStatus.status));
      }
      if (cooperator.seniorCitizenClassification === "Yes") pushGrouped(byDemographic, "Senior Citizen");
      if (cooperator.pwd === "Yes") pushGrouped(byDemographic, "PWD");
      if (cooperator.indigenousPeople === "Yes") pushGrouped(byDemographic, "Indigenous People");
    });
    const activeSetupPhases = active.flatMap(({ beneficiary, cooperator }) =>
      hasSetupService(beneficiary) ? cooperator.setup.phases.filter((phase) => !isPhaseArchived(phase)) : []
    );
    return {
      asOf,
      totalCooperators: active.length,
      totalFirmsWithSetup: active.filter(({ beneficiary }) => hasSetupService(beneficiary)).length,
      totalServicesAvailed: active.reduce((sum, { cooperator }) => sum + cooperator.services.length, 0),
      activeSetupProjects: activeSetupPhases.filter((phase) => phase.status === "Ongoing" && getPhaseTotalFund(phase) > 0).length,
      completedSetupProjects: activeSetupPhases.filter((phase) => phase.status === "Completed").length,
      terminatedSetupProjects: activeSetupPhases.filter((phase) => phase.status === "Terminated").length,
      charts: {
        byBusinessSector: groupedRows(byBusinessSector),
        byDistrict: groupedRows(byDistrict),
        byServiceCategory: groupedRows(byServiceCategory),
        bySetupStatus: groupedRows(bySetupStatus),
        byEnterpriseClassification: groupedRows(byEnterpriseClassification),
        byDemographic: groupedRows(byDemographic)
      }
    };
  },
  getSetupRefundDashboard(filters = {}) {
    const asOf = filters.asOf || todayIso();
    const reportingYearFilter = filters.reportingYear || filters.collectionYear || "";
    const projectYearFilter = filters.projectYear || (reportingYearFilter ? "" : filters.year || "");
    const year = Number(reportingYearFilter || filters.year || asOf.slice(0, 4));
    const state = repository.getSnapshot();
    const setupRecords = getSetupRecords({ ...filters, asOf, year: projectYearFilter });
    const activeCandidateRecords = getSetupRecords({ ...filters, asOf, year: projectYearFilter }, { includeArchived: true });
    const setupProjectRecords = setupRecords.flatMap((record) => setupProjectRowsForRecord(record, { ...filters, year: projectYearFilter }));
    const activeCandidateProjectRecords = activeCandidateRecords.flatMap((record) => setupProjectRowsForRecord(record, { ...filters, year: projectYearFilter }));
    const refundRecords = setupProjectRecords.filter((record) => record.refundApplicable);
    const activeRecords = activeCandidateProjectRecords.filter((record) => isActiveSetupRefundRecord(record));
    // Active SETUP Refund card counts unique firms with at least one active unpaid refund-bearing phase.
    const activeIds = new Set(activeRecords.map(({ beneficiary }) => beneficiary.id));
    const setupCooperatorIds = new Set(setupRecords.map(({ beneficiary }) => beneficiary.id));
    activeIds.forEach((id) => setupCooperatorIds.add(id));
    const selectedMonthKey = monthKey(asOf);
    const selectedPeriod = {
      label: monthYearLabel(selectedMonthKey),
      displayLabel: monthYearLabel(selectedMonthKey),
      start: `${selectedMonthKey}-01`,
      end: addMonths(`${selectedMonthKey}-01`, 1)
    };
    const monthlyTarget = activeRecords.reduce((sum, { financials }) => {
      return sum + financials.schedule
        .filter((row) => monthKey(row.dueDate) === selectedMonthKey && row.status !== "Deferred")
        .reduce((inner, row) => inner + Number(row.expectedAmount || 0), 0);
    }, 0);
    const monthlyCollection = activeRecords.reduce((sum, { beneficiary, cooperator, phase }) => {
      return sum + phasePayments(state, beneficiary, cooperator, phase, asOf)
        .filter((payment) => payment.paymentDate >= selectedPeriod.start && payment.paymentDate <= asOf)
        .reduce((inner, payment) => inner + Number(payment.amount || 0), 0);
    }, 0);
    const monthlyPerformance = targetCollectionRows(activeRecords, state, reportingYearFilter || filters.year || "", asOf);
    const calendarMonthlyPerformance = monthlyPerformance;
    const paymentAnalytics = setupPaymentAnalytics(refundRecords, asOf);
    const delinquentPayors = activeRecords
      .map(({ beneficiary, cooperator, financials }) => {
        const overdueRows = financials.schedule.filter((row) => row.status === "Overdue" && row.remainingAmount > 0.01);
        return {
          id: beneficiary.id,
          firmName: cooperator.firmName,
          totalOverdueArrears: roundCurrency(overdueRows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0)),
          delayedMonths: overdueRows.length,
          searchText: `${cooperator.firmName} ${cooperator.cooperatorName} ${cooperator.municipality}`
        };
      })
      .filter((item) => item.totalOverdueArrears > 0)
      .sort((a, b) => b.totalOverdueArrears - a.totalOverdueArrears || b.delayedMonths - a.delayedMonths);
    const byBusinessSector = new Map();
    const byDistrict = new Map();
    const byProjectStatus = new Map();
    const setupFundByYear = new Map();
    setupProjectRecords.forEach(({ cooperator, phase, phaseStatus }) => {
      pushGrouped(byBusinessSector, cooperator.businessSector);
      pushGrouped(byDistrict, normalizedDistrictLabel(cooperator.district));
      pushGrouped(byProjectStatus, normalizedSetupStatus(phaseStatus));
      const projectYear = String(phase.yearAwarded || "No Year");
      const existing = setupFundByYear.get(projectYear) || { label: projectYear, fund: 0, firms: new Set() };
      existing.fund += Number(phase.fundAssistance || 0);
      existing.firms.add(`${cooperator.id || cooperator.firmName}-${phase.phase}`);
      setupFundByYear.set(projectYear, existing);
    });
    return {
      asOf,
      year,
      reportingYear: year,
      projectYear: projectYearFilter,
      lastUpdated: new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }),
      totalSetupCustomers: setupProjectRecords.length,
      totalSetupCooperators: setupCooperatorIds.size,
      activeSetupRefundCount: activeIds.size,
      activeSetupOutstanding: roundCurrency(activeRecords.reduce((sum, item) => sum + Number(item.financials.outstandingBalance || 0), 0)),
      monthlyTarget: roundCurrency(monthlyTarget),
      monthlyCollection: roundCurrency(monthlyCollection),
      selectedPeriod,
      monthlyPerformance,
      calendarMonthlyPerformance,
      paymentAnalytics,
      delinquentPayors,
      filters: {
        municipalities: [...new Set(setupRecords.map((item) => item.cooperator.municipality).filter(Boolean))].sort(),
        districts: [...new Set(setupRecords.map((item) => item.cooperator.district).filter(Boolean))].sort(),
        businessSectors: [...new Set(setupRecords.map((item) => item.cooperator.businessSector).filter(Boolean))].sort(),
        officers: [...new Set(setupRecords.flatMap((item) => item.cooperator.setup.phases.map((phase) => phase.officer)).filter(Boolean))].sort(),
        phases: [...new Set(setupRecords.flatMap((item) => item.cooperator.setup.phases.map((phase) => phase.phase)).filter(Boolean))].sort()
      },
      charts: {
        byBusinessSector: groupedRows(byBusinessSector),
        byDistrict: groupedRows(byDistrict),
        byProjectStatus: groupedRows(byProjectStatus),
        setupFundByYear: [...setupFundByYear.values()]
          .map((row) => ({ label: row.label, fund: roundCurrency(row.fund), firms: row.firms.size }))
          .sort((a, b) => Number(b.label) - Number(a.label))
      },
      activeIds
    };
  },
  getKpiMonitoring(filters = {}) {
    const asOf = filters.asOf || todayIso();
    let refundRecords = beneficiaryService
      .list({ asOf })
      .flatMap((beneficiary) => {
        const cooperator = getCooperatorView(beneficiary, beneficiary.financials || getBeneficiaryFinancials(beneficiary.id, asOf), asOf);
        return (cooperator.setup?.phases || [])
          .filter((phase) => !isPhaseArchived(phase))
          .filter((phase) => phaseHasRefundScheme(phase))
          .map((phase) => {
            const financials = getPhaseFinancials({ beneficiary, cooperator, phase, asOf });
            const completionDate = getRefundCompletionDate(beneficiary, financials);
            const monitoringStatus = financials.outstandingBalance <= 0.01 && financials.totalRepayable > 0
              ? getRefundMonitoringStatus(beneficiary, financials, asOf)
              : "Active Refund Monitoring";
            return {
              id: beneficiary.id,
              phaseId: phase.id,
              phase,
              beneficiary,
              cooperator,
              financials,
              completionDate,
              monitoringStatus,
              archiveEligible: monitoringStatus === "Archive Eligible",
              searchText: `${cooperator.firmName} ${cooperator.cooperatorName} ${cooperator.municipality} ${phase.phase} ${monitoringStatus}`
            };
          });
      })
      .filter(({ beneficiary }) => !beneficiary.archived);
    if (filters.cooperatorId) refundRecords = refundRecords.filter((item) => item.id === filters.cooperatorId);
    const monitoredRecords = refundRecords.filter((item) => !item.archiveEligible);
    const archiveEligibleRecords = refundRecords.filter((item) => item.archiveEligible);
    const activeRefundRecords = monitoredRecords.filter((item) => item.financials.outstandingBalance > 0.01);
    const completedRetainedRecords = monitoredRecords.filter((item) => item.monitoringStatus === "Refund Completed - Monitoring Until Year End");
    const totals = monitoredRecords.reduce(
      (summary, item) => {
        summary.totalRepayable += item.financials.totalRepayable;
        summary.totalPaid += item.financials.totalPaid;
        summary.outstandingBalance += item.financials.outstandingBalance;
        summary.amountDue += item.financials.amountDue;
        summary.pastDue += item.financials.pastDue;
        return summary;
      },
      { totalRepayable: 0, totalPaid: 0, outstandingBalance: 0, amountDue: 0, pastDue: 0 }
    );
    const delinquentRecords = monitoredRecords
      .map((item) => {
        const overdueRows = item.financials.schedule.filter((row) => row.status === "Overdue" && row.remainingAmount > 0.01);
        return {
          ...item,
          totalOverdueArrears: roundCurrency(overdueRows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0)),
          delayedMonths: overdueRows.length
        };
      })
      .filter((item) => item.totalOverdueArrears > 0);
    return {
      asOf,
      records: monitoredRecords,
      allRefundRecords: refundRecords,
      archiveEligibleRecords,
      activeRefundRecords,
      completedRetainedRecords,
      delinquentRecords,
      monitoredFirmCount: monitoredRecords.length,
      activeRefundCount: activeRefundRecords.length,
      completedRetainedCount: completedRetainedRecords.length,
      archiveEligibleCount: archiveEligibleRecords.length,
      fullyPaidAccounts: completedRetainedRecords.length,
      collectionRate: percent(totals.totalPaid, totals.totalRepayable),
      ...totals
    };
  },
  async archiveEligibleCompletedRefunds({ asOf = todayIso() } = {}) {
    const candidates = [];
    beneficiaryService
      .list({ includeArchived: true, asOf })
      .forEach((beneficiary) => {
        const cooperator = getCooperatorView(beneficiary, beneficiary.financials || getBeneficiaryFinancials(beneficiary.id, asOf), asOf);
        (cooperator.setup?.phases || []).forEach((phase) => {
          if (isPhaseArchived(phase)) return;
          const financials = getPhaseFinancials({ beneficiary, cooperator, phase, asOf });
          if (!phaseHasRefundScheme(phase) || financials.totalRepayable <= 0 || financials.outstandingBalance > 0.01) return;
          const completionDate = getRefundCompletionDate(beneficiary, financials);
          if (!completionDate || !isRefundArchiveEligible(completionDate, asOf)) return;
          candidates.push({ beneficiary, cooperator, phase, completionDate });
        });
      });
    const archived = [];
    for (const { beneficiary, cooperator, phase, completionDate } of candidates) {
      const services = (beneficiary.services || []).map((service, index) => {
        const phaseLabel = setupPhaseLabels.includes(service.subtype) ? service.subtype : setupPhaseLabels[index] || service.subtype || `Phase ${index + 1}`;
        if (service.category !== setupCategory || phaseLabel !== phase.phase) return service;
        const meta = parseSetupPhaseRemarks(service.remarks);
        return {
          ...service,
          remarks: formatSetupPhaseRemarks({
            ...meta,
            status: meta.status || phase.status || "Completed",
            archived: true,
            archivedAt: asOf
          })
        };
      });
      const activePhaseRemaining = (cooperator.setup?.phases || []).some((item) => item.phase !== phase.phase && !isPhaseArchived(item) && item.status === "Ongoing");
      const saved = await repository.patchAsync("beneficiaries", beneficiary.id, {
        services,
        archived: activePhaseRemaining ? false : beneficiary.archived,
        status: activePhaseRemaining ? "Not Yet Started" : beneficiary.status,
        updatedAt: new Date().toISOString()
      });
      if (saved) repository.addActivity({ id: uid("act"), beneficiaryId: beneficiary.id, action: `Auto-archived ${phase.phase} after SETUP refund year-end (${completionDate})`, timestamp: new Date().toISOString() });
      if (saved) archived.push({ id: beneficiary.id, firmName: beneficiary.firmName || beneficiary.business?.firmName || beneficiary.id, phase: phase.phase, completionDate });
    }
    return { asOf, scanned: candidates.length, archived };
  },
  getSummary(filters = {}) {
    const asOf = filters.asOf || todayIso();
    let beneficiaries = beneficiaryService.list({ asOf });
    if (filters.cooperatorId) beneficiaries = beneficiaries.filter((item) => item.id === filters.cooperatorId);
    if (filters.year) beneficiaries = beneficiaries.filter((item) => String(item.project.projectYear) === String(filters.year));
    if (filters.source) beneficiaries = beneficiaries.filter((item) => item.project.sourceOfFund === filters.source);
    if (filters.status) beneficiaries = beneficiaries.filter((item) => item.status === filters.status);
    const state = repository.getSnapshot();
    const beneficiaryIds = new Set(beneficiaries.map((item) => item.id));
    const payments = state.payments.filter((item) => beneficiaryIds.has(item.beneficiaryId) && isActivePayment(item, asOf));
    const totalAssistance = beneficiaries.reduce((sum, item) => sum + Number(item.financial.assistanceAmount || 0), 0);
    const totals = beneficiaries.reduce(
      (summary, item) => {
        const financials = getBeneficiaryFinancials(item.id, asOf);
        summary.totalRepayable += financials.totalRepayable;
        summary.totalPaid += financials.totalPaid;
        summary.outstandingBalance += financials.outstandingBalance;
        summary.amountDue += financials.amountDue;
        summary.pastDue += financials.pastDue;
        summary.advancePayments += financials.advancePayment;
        return summary;
      },
      { totalRepayable: 0, totalPaid: 0, outstandingBalance: 0, amountDue: 0, pastDue: 0, advancePayments: 0 }
    );
    const statusCounts = beneficiaries.reduce((map, item) => {
      map[item.status] = (map[item.status] || 0) + 1;
      return map;
    }, {});
    const monthlyCollection = Array.from({ length: 8 }, (_, index) => {
      const date = addMonths(asOf.slice(0, 8) + "01", index - 7);
      const label = date.slice(0, 7);
      const value = payments.filter((payment) => payment.paymentDate.startsWith(label)).reduce((sum, item) => sum + item.amount, 0);
      return { label, value };
    });
    const byYear = beneficiaries.reduce((map, item) => {
      const year = item.project.projectYear;
      if (!map[year]) map[year] = { label: String(year), released: 0, collected: 0 };
      map[year].released += Number(item.financial.assistanceAmount || 0);
      map[year].collected += getTotalPaid(item.id, state, asOf);
      return map;
    }, {});
    const bySource = beneficiaries.reduce((map, item) => {
      const source = item.project.sourceOfFund;
      map[source] = (map[source] || 0) + getTotalPaid(item.id, state, asOf);
      return map;
    }, {});
    const overdue = beneficiaries
      .map((item) => ({ ...item, financials: getBeneficiaryFinancials(item.id, asOf) }))
      .filter((item) => item.financials.pastDue > 0)
      .sort((a, b) => b.financials.pastDue - a.financials.pastDue);
    const recon = reconciliationService.list({ beneficiaryIds, asOf });
    const pdcSoon = state.payments.filter(
      (payment) =>
        beneficiaryIds.has(payment.beneficiaryId) &&
        isOpenPaymentInstrument(payment, asOf) &&
        payment.method === "PDC" &&
        payment.checkDate &&
        daysBetween(asOf, payment.checkDate) >= 0 &&
        daysBetween(asOf, payment.checkDate) <= 14
    );
    const defermentSoon = state.deferments.filter(
      (item) =>
        !item.archived &&
        beneficiaryIds.has(item.beneficiaryId) &&
        item.status === "Approved Externally" &&
        daysBetween(asOf, item.endDate) >= 0 &&
        daysBetween(asOf, item.endDate) <= 30
    );
    return {
      asOf,
      totalBeneficiaries: beneficiaries.length,
      totalAssistance,
      ...totals,
      collectionRate: percent(totals.totalPaid, totals.totalRepayable),
      activeAccounts: beneficiaries.filter((item) => activeDashboardStatuses.has(item.status)).length,
      fullyPaidAccounts: beneficiaries.filter((item) => item.status === "Fully Paid").length,
      deferredAccounts: beneficiaries.filter((item) => item.status === "Deferred").length,
      terminatedWithdrawnAccounts: beneficiaries.filter((item) => ["Terminated", "Withdrawn"].includes(item.status)).length,
      charts: {
        monthlyCollection,
        releasedVsCollected: Object.values(byYear),
        byStatus: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
        byProjectYear: Object.values(byYear).map((item) => ({ label: item.label, value: item.collected })),
        bySource: Object.entries(bySource).map(([label, value]) => ({ label, value })),
        aging: [
          { label: "1-30", value: overdue.filter((item) => item.financials.schedule.some((row) => row.daysOverdue >= 1 && row.daysOverdue <= 30)).length },
          { label: "31-60", value: overdue.filter((item) => item.financials.schedule.some((row) => row.daysOverdue >= 31 && row.daysOverdue <= 60)).length },
          { label: "61-90", value: overdue.filter((item) => item.financials.schedule.some((row) => row.daysOverdue >= 61 && row.daysOverdue <= 90)).length },
          { label: "90+", value: overdue.filter((item) => item.financials.schedule.some((row) => row.daysOverdue > 90)).length }
        ],
        topOverdue: overdue.slice(0, 5).map((item) => ({ label: item.firmName, value: item.financials.pastDue }))
      },
      attention: [
        ...overdue.slice(0, 4).map((item) => ({ type: "Overdue account", text: item.firmName, meta: item.financials.pastDue })),
        ...recon.filter((item) => item.status !== "Matched").slice(0, 4).map((item) => ({ type: item.status, text: item.beneficiary?.firmName || "Payment record", meta: Math.abs(item.difference) })),
        ...pdcSoon.map((item) => ({ type: "PDC nearing date", text: item.referenceNumber, meta: item.amount })),
        ...defermentSoon.map((item) => ({ type: "Deferment ending", text: repository.get("beneficiaries", item.beneficiaryId)?.firmName || item.id, meta: item.endDate }))
      ]
    };
  }
};

export const reportService = {
  reportTypes: [
    "Master Cooperator Report",
    "SETUP Project Report",
    "SETUP Refund Report",
    "Monthly SETUP Collection Report",
    "Annual SETUP Collection Report",
    "Cooperator Account Statement",
    "Individual Refund Schedule",
    "Delinquent SETUP Accounts",
    "Completed SETUP Projects",
    "Terminated SETUP Projects",
    "Collection by Municipality",
    "Collection by District",
    "Collection by Business Sector",
    "Payment and OR Reconciliation",
    "Outstanding Balance Report"
  ],
  getPreview(type, filters = {}) {
    const asOf = filters.asOf || todayIso();
    const state = repository.getSnapshot();
    const scopedBeneficiaries = beneficiaryService
      .list({ asOf })
      .filter((item) => {
        if (filters.cooperatorId && item.id !== filters.cooperatorId) return false;
        if (filters.year && String(item.project.projectYear) !== String(filters.year)) return false;
        const cooperator = getCooperatorView(item, item.financials, asOf);
        const setupStatus = deriveSetupProjectStatus(item, item.financials, asOf).status;
        if (filters.source && item.project.sourceOfFund !== filters.source) return false;
        if (filters.status && item.status !== filters.status) return false;
        if (filters.municipality && cooperator.municipality !== filters.municipality) return false;
        if (filters.district && cooperator.district !== filters.district) return false;
        if (filters.businessSector && cooperator.businessSector !== filters.businessSector) return false;
        if (filters.officer && cooperator.setup.assignedProjectOfficer !== filters.officer) return false;
        if (filters.projectStatus && setupStatus !== filters.projectStatus) return false;
        return true;
      });
    const scopedBeneficiaryIds = new Set(scopedBeneficiaries.map((item) => item.id));
    const dateInRange = (date) => {
      if (filters.dateFrom && date < filters.dateFrom) return false;
      if (filters.dateTo && date > filters.dateTo) return false;
      return true;
    };
    const scopedPayments = state.payments
      .filter((payment) => scopedBeneficiaryIds.has(payment.beneficiaryId) && isActivePayment(payment, asOf) && dateInRange(payment.paymentDate))
      .map((payment) => ({
        ...payment,
        beneficiary: scopedBeneficiaries.find((beneficiary) => beneficiary.id === payment.beneficiaryId),
        receipt: state.receipts.find((receipt) => !receipt.archived && receipt.paymentId === payment.id && receipt.orDate <= asOf)
      }));
    if (type === "Payment and OR Reconciliation") {
      return reconciliationService.list({ beneficiaryIds: scopedBeneficiaryIds, asOf })
        .filter((item) => dateInRange(item.payment.paymentDate))
        .map((item) => ({
        Cooperator: item.beneficiary?.firmName || "",
        Reference: item.payment.referenceNumber,
        "Payment Amount": item.payment.amount,
        "OR Number": item.receipt?.orNumber || "Missing",
        Difference: item.difference,
        Status: item.status
      }));
    }
    if (["Monthly Collection Report", "Annual Collection Report", "Monthly SETUP Collection Report", "Annual SETUP Collection Report", "SETUP Refund Report", "SETUP Refund Collection Report"].includes(type)) {
      return scopedPayments.map((payment) => ({
        Cooperator: payment.beneficiary?.firmName || "",
        Municipality: payment.beneficiary?.municipality || "",
        District: getCooperatorView(payment.beneficiary || {}).district || "",
        "Payment Date": payment.paymentDate,
        Reference: payment.referenceNumber,
        Method: payment.method,
        Amount: payment.amount,
        "OR Number": payment.receipt?.orNumber || "Missing",
        Status: payment.status
      }));
    }
    if (type === "Collection by Municipality") {
      return Object.values(
        scopedPayments.reduce((map, payment) => {
          const municipality = payment.beneficiary?.municipality || "Not provided";
          if (!map[municipality]) map[municipality] = { Municipality: municipality, "Payment Count": 0, Collected: 0 };
          map[municipality]["Payment Count"] += 1;
          map[municipality].Collected = roundCurrency(map[municipality].Collected + Number(payment.amount || 0));
          return map;
        }, {})
      );
    }
    if (type === "Collection by District") {
      return Object.values(
        scopedPayments.reduce((map, payment) => {
          const district = getCooperatorView(payment.beneficiary || {}).district || "Not classified";
          if (!map[district]) map[district] = { District: district, "Payment Count": 0, Collected: 0 };
          map[district]["Payment Count"] += 1;
          map[district].Collected = roundCurrency(map[district].Collected + Number(payment.amount || 0));
          return map;
        }, {})
      );
    }
    if (type === "Collection by Business Sector") {
      return Object.values(
        scopedPayments.reduce((map, payment) => {
          const sector = getCooperatorView(payment.beneficiary || {}).businessSector || "Not classified";
          if (!map[sector]) map[sector] = { "Business Sector": sector, "Payment Count": 0, Collected: 0 };
          map[sector]["Payment Count"] += 1;
          map[sector].Collected = roundCurrency(map[sector].Collected + Number(payment.amount || 0));
          return map;
        }, {})
      );
    }
    if (type === "Individual Refund Schedule") {
      return scopedBeneficiaries.flatMap((item) =>
        item.financials.schedule.map((row) => ({
          Cooperator: item.firmName,
          "Refund Month": row.refundMonth,
          "Expected Amount": row.expectedAmount,
          "Amount Paid": row.amountPaid,
          "Remaining Amount": row.remainingAmount,
          "Due Date": row.dueDate,
          Status: row.status
        }))
      );
    }
    if (type === "Delinquent SETUP Accounts") {
      return this.getDelinquentRows(filters);
    }
    return scopedBeneficiaries
      .filter((item) => {
        const setupStatus = deriveSetupProjectStatus(item, item.financials, asOf).status;
        if (type === "Completed SETUP Projects") return setupStatus === "Completed";
        if (type === "Terminated SETUP Projects") return setupStatus === "Terminated";
        if (type === "Outstanding Balance Report") return item.financials.outstandingBalance > 0;
        return true;
      })
      .map((item) => ({
        "Name of Firm": getCooperatorView(item, item.financials, asOf).firmName,
        "Name of Cooperator": getCooperatorView(item, item.financials, asOf).cooperatorName,
        Municipality: getCooperatorView(item, item.financials, asOf).municipality,
        District: getCooperatorView(item, item.financials, asOf).district,
        "Business Sector": getCooperatorView(item, item.financials, asOf).businessSector || "Not classified",
        "Enterprise Classification": getCooperatorView(item, item.financials, asOf).enterpriseClassification,
        "Year Awarded": getCooperatorView(item, item.financials, asOf).setup.yearAwarded,
        "SETUP Project Status": deriveSetupProjectStatus(item, item.financials, asOf).status,
        "Total Paid": item.financials.totalPaid,
        Balance: item.financials.outstandingBalance,
        "Past Due": item.financials.pastDue,
        "As of": asOf
      }));
  },
  getDelinquentRows(filters = {}) {
    return dashboardService.getSetupRefundDashboard(filters).delinquentPayors.map((item) => ({
      "Name of Firm": item.firmName,
      "Total Overdue Arrears": item.totalOverdueArrears,
      "Delayed Since": `${item.delayedMonths} ${item.delayedMonths === 1 ? "month" : "months"}`
    }));
  }
};

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseImportDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? ""
    : `${String(parsed.getFullYear()).padStart(4, "0")}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const importFields = [
  { key: "firmName", label: "Name of firm", required: true, aliases: ["firmname", "beneficiary", "beneficiaryname", "name", "firm"] },
  { key: "proprietor", label: "Name of cooperator", required: true, aliases: ["proprietor", "representative", "owner", "contactperson", "cooperator"] },
  { key: "address", label: "Complete address", aliases: ["address", "completeaddress"] },
  { key: "municipality", label: "Municipality", required: true, aliases: ["municipality", "city", "location"] },
  { key: "contactNumber", label: "Contact number", aliases: ["contactnumber", "phone", "mobile", "telephone"] },
  { key: "email", label: "Email address", aliases: ["email", "emailaddress"] },
  { key: "notes", label: "Notes", aliases: ["notes", "remarks"] },
  { key: "projectTitle", label: "SETUP project title", required: true, aliases: ["projecttitle", "project", "typeofproject"] },
  { key: "spin", label: "Legacy project number", aliases: ["spin", "projectnumber", "projectno", "reference", "refno"] },
  { key: "projectYear", label: "Project year", required: true, aliases: ["projectyear", "year"] },
  { key: "sourceOfFund", label: "Legacy fund source", aliases: ["sourceoffund", "fundsource", "sourcefund", "fund"] },
  { key: "officer", label: "Assigned project officer", aliases: ["officer", "projectofficer", "assignedofficer"] },
  { key: "projectStatus", label: "Project status", aliases: ["projectstatus"] },
  { key: "assistanceAmount", label: "Assistance amount", required: true, aliases: ["assistanceamount", "amount", "approvedamount", "releasedamount"] },
  { key: "releaseDate", label: "Release date", required: true, aliases: ["releasedate", "datereleased"] },
  { key: "projectDurationMonths", label: "Project duration months", aliases: ["projectdurationmonths", "duration", "durationmonths"] },
  { key: "repaymentStartDate", label: "Repayment start date", required: true, aliases: ["repaymentstartdate", "startdate", "refundstartdate"] },
  { key: "originalDueDate", label: "Original due date", required: true, aliases: ["originalduedate", "duedate", "maturitydate"] },
  { key: "installments", label: "Number of installments", required: true, aliases: ["installments", "numberofinstallments", "months", "terms"] },
  { key: "monthlyRefundAmount", label: "Monthly refund amount", required: true, aliases: ["monthlyrefundamount", "monthlyrefund", "monthlyamortization", "monthly"] },
  { key: "technologyTransferFee", label: "Technology transfer fee", aliases: ["technologytransferfee", "ttf"] },
  { key: "optionToBuyAmount", label: "Option-to-buy amount", aliases: ["optiontobuyamount", "otb"] },
  { key: "otherFees", label: "Other fees", aliases: ["otherfees", "fees"] },
  { key: "status", label: "Account status", aliases: ["status", "accountstatus"] }
];

function defaultImportMapping(columns) {
  const normalizedColumns = columns.map((column) => ({ column, normalized: normalizeHeader(column) }));
  return Object.fromEntries(
    importFields.map((field) => {
      const match = normalizedColumns.find((column) => field.aliases?.includes(column.normalized) || normalizeHeader(field.label) === column.normalized);
      return [field.key, match?.column || ""];
    })
  );
}

function getMappedValue(row, mapping, fieldKey) {
  const column = mapping[fieldKey];
  return column ? row[column] : "";
}

function buildImportValidation(payload, mapping = payload.mapping) {
  const existingSpins = new Set(repository.list("beneficiaries").map((item) => item.project.spin));
  const seenSpins = new Set();
  const errors = [];
  const duplicates = [];
  const validRecords = [];
  payload.rows.forEach((row, index) => {
    const rowNumber = row.__rowNumber || index + 2;
    const data = Object.fromEntries(importFields.map((field) => [field.key, getMappedValue(row, mapping, field.key)]));
    const spin = String(data.spin || "").trim();
    importFields
      .filter((field) => field.required)
      .forEach((field) => {
        if (!String(data[field.key] ?? "").trim()) errors.push(`Row ${rowNumber}: ${field.label} is required.`);
      });
    if (spin && (existingSpins.has(spin) || seenSpins.has(spin))) {
      duplicates.push(spin);
      errors.push(`Row ${rowNumber}: Duplicate legacy project number ${spin}.`);
    }
    seenSpins.add(spin);
    const releaseDate = parseImportDate(data.releaseDate);
    const repaymentStartDate = parseImportDate(data.repaymentStartDate);
    const originalDueDate = parseImportDate(data.originalDueDate);
    if (data.releaseDate && !releaseDate) errors.push(`Row ${rowNumber}: Release date is invalid.`);
    if (data.repaymentStartDate && !repaymentStartDate) errors.push(`Row ${rowNumber}: Repayment start date is invalid.`);
    if (data.originalDueDate && !originalDueDate) errors.push(`Row ${rowNumber}: Original due date is invalid.`);
    const now = new Date().toISOString();
    const record = {
      id: uid("ben"),
      firmName: String(data.firmName || "").trim(),
      proprietor: String(data.proprietor || "").trim(),
      address: String(data.address || "").trim(),
      municipality: String(data.municipality || "").trim(),
      contactNumber: String(data.contactNumber || "").trim(),
      email: String(data.email || "").trim(),
      notes: String(data.notes || "").trim(),
      project: {
        title: String(data.projectTitle || "").trim(),
        spin,
        projectYear: parseInteger(data.projectYear, new Date().getFullYear()),
        sourceOfFund: String(data.sourceOfFund || "SETUP").trim(),
        officer: String(data.officer || "").trim(),
        status: String(data.projectStatus || "Imported").trim()
      },
      financial: {
        assistanceAmount: toNumber(data.assistanceAmount),
        releaseDate,
        projectDurationMonths: parseInteger(data.projectDurationMonths, parseInteger(data.installments, 36)),
        repaymentStartDate,
        originalDueDate,
        installments: parseInteger(data.installments, 1),
        monthlyRefundAmount: toNumber(data.monthlyRefundAmount),
        technologyTransferFee: toNumber(data.technologyTransferFee),
        optionToBuyAmount: toNumber(data.optionToBuyAmount),
        otherFees: toNumber(data.otherFees),
        remarks: "Imported from spreadsheet"
      },
      status: accountStatuses.includes(String(data.status || "").trim()) ? String(data.status).trim() : "Under Review",
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    if (record.financial.assistanceAmount < 0) errors.push(`Row ${rowNumber}: Assistance amount cannot be negative.`);
    if (record.financial.installments <= 0) errors.push(`Row ${rowNumber}: Installments must be greater than zero.`);
    if (record.financial.monthlyRefundAmount < 0) errors.push(`Row ${rowNumber}: Monthly refund amount cannot be negative.`);
    const rowErrors = errors.filter((message) => message.startsWith(`Row ${rowNumber}:`));
    if (!rowErrors.length) validRecords.push(record);
  });
  return {
    ...payload,
    mapping,
    validRecords,
    preview: validRecords.slice(0, 25).map((item) => ({
      firmName: item.firmName,
      spin: item.project.spin,
      municipality: item.municipality,
      assistanceAmount: item.financial.assistanceAmount,
      status: item.status
    })),
    errors,
    duplicates: [...new Set(duplicates)],
    validCount: validRecords.length,
    invalidCount: Math.max(0, payload.rows.length - validRecords.length)
  };
}

export const importService = {
  fields: importFields,
  validateFile(file) {
    if (!file) return "Upload a spreadsheet file.";
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return "Unsupported file. Use XLSX, XLS, or CSV.";
    if (file.size > 15 * 1024 * 1024) return "File is larger than the 15 MB frontend import limit.";
    return "";
  },
  async parseFile(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const payload = {
      fileName: file.name,
      workbook,
      sheets: workbook.SheetNames,
      selectedSheet: workbook.SheetNames[0] || "",
      columns: [],
      rows: [],
      mapping: {},
      preview: [],
      errors: [],
      duplicates: [],
      validRecords: [],
      validCount: 0,
      invalidCount: 0,
      importedCount: 0
    };
    return this.selectSheet(payload, payload.selectedSheet);
  },
  selectSheet(payload, sheetName) {
    const sheet = payload.workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const columns = table.length ? Object.keys(table[0]).filter((column) => !column.startsWith("__EMPTY")) : [];
    const rows = table.map((row, index) => ({ ...row, __rowNumber: index + 2 }));
    const nextPayload = {
      ...payload,
      selectedSheet: sheetName,
      columns,
      rows,
      mapping: defaultImportMapping(columns)
    };
    return buildImportValidation(nextPayload, nextPayload.mapping);
  },
  updateMapping(payload, mapping) {
    return buildImportValidation(payload, mapping);
  },
  async importValidRecords(payload) {
    if (!payload.validRecords.length) return { ...payload, importedCount: 0 };
    await repository.bulkUpsert("beneficiaries", payload.validRecords);
    payload.validRecords.forEach((record) => {
      repository.addActivity({ id: uid("act"), beneficiaryId: record.id, action: "Cooperator imported", timestamp: new Date().toISOString() });
    });
    return { ...payload, importedCount: payload.validRecords.length };
  }
};

export const settingsService = {
  get() {
    return repository.getState().settings;
  },
  save(settings) {
    const state = repository.getState();
    state.settings = { ...state.settings, ...settings };
    repository.saveState(state);
    return state.settings;
  }
};
