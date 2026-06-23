import assert from "node:assert/strict";
import {
  beneficiaryService,
  collectionService,
  dashboardService,
  adjustmentService,
  defermentService,
  deriveSetupProjectStatus,
  getBeneficiaryFinancials,
  getSchedule,
  receiptService,
  reportService,
  settingsService
} from "../src/services.js";
import { repository } from "../src/repository.js";
import { addMonths, formatCurrency } from "../src/utils.js";
import { validateRecord } from "../server/api.mjs";

const beneficiaries = beneficiaryService.list();
assert.equal(beneficiaries.length, 0, "frontend should start with no beneficiary data");
assert.ok(formatCurrency(1250).includes("1,250.00"), "currency formatting should remain available");

const schedule = getSchedule("missing-record");
assert.deepEqual(schedule, [], "schedule placeholder should handle missing records");

const summary = dashboardService.getSummary();
assert.equal(summary.totalBeneficiaries, 0, "dashboard should start empty");
assert.ok(Array.isArray(summary.attention), "dashboard attention panel should exist");

const receipts = receiptService.list();
assert.equal(receipts.length, 0, "frontend should start with no receipt data");

const reportRows = reportService.getPreview("Master Collection Report");
assert.equal(reportRows.length, 0, "report preview should start with no data");

assert.equal(settingsService.get().currencyFormat, "Philippine Peso", "frontend defaults should remain available");

const beneficiary = await beneficiaryService.saveFromForm({
  firmName: "Schedule Test Beneficiary",
  proprietor: "Test Owner",
  municipality: "Vigan City",
  projectTitle: "Refund Test",
  spin: "SMOKE-SPIN-001",
  projectYear: "2026",
  sourceOfFund: "Provincial Livelihood Fund",
  assistanceAmount: "1000",
  releaseDate: "2026-01-01",
  repaymentStartDate: "2026-02-01",
  originalDueDate: "2026-04-01",
  installments: "3",
  monthlyRefundAmount: "333.33",
  status: "Active - Current"
});

const createdSchedule = getSchedule(beneficiary.id, "2026-02-01");
assert.equal(createdSchedule.length, 3, "created beneficiary should have three installments");
assert.equal(
  Number(createdSchedule.reduce((sum, row) => sum + row.expectedAmount, 0).toFixed(2)),
  1000,
  "schedule installments should equal total repayable"
);

const underAllocatedErrors = collectionService.validate(
  { beneficiaryId: beneficiary.id, paymentDate: "2026-02-02", amount: "333.33", method: "Cash", status: "Received" },
  []
);
assert.equal(underAllocatedErrors.allocations, undefined, "payment validation should auto-allocate when manual allocations are not provided");

collectionService.create(
  { beneficiaryId: beneficiary.id, paymentDate: "2026-02-02", amount: "333.33", method: "Cash", status: "Received" },
  [{ beneficiaryId: beneficiary.id, installmentNumber: 1, amount: 333.33 }]
);
const financials = getBeneficiaryFinancials(beneficiary.id, "2026-02-03");
assert.equal(Number(financials.totalPaid.toFixed(2)), 333.33, "financials should include recorded payments");
assert.equal(Number(financials.outstandingBalance.toFixed(2)), 666.67, "outstanding balance should subtract payments");

repository.reset();

const dashboardBeneficiary = {
  id: "dash-ben-1",
  firmName: "Dashboard Audit",
  proprietor: "Audit Owner",
  address: "",
  municipality: "Vigan City",
  contactNumber: "",
  email: "",
  notes: "",
  project: {
    title: "Dashboard Refund",
    spin: "DASH-SPIN-001",
    projectYear: 2026,
    sourceOfFund: "Provincial Livelihood Fund",
    officer: "",
    status: ""
  },
  financial: {
    assistanceAmount: 1200,
    releaseDate: "2026-01-01",
    projectDurationMonths: 12,
    repaymentStartDate: "2026-02-01",
    originalDueDate: "2027-01-01",
    installments: 12,
    monthlyRefundAmount: 100,
    technologyTransferFee: 0,
    optionToBuyAmount: 0,
    otherFees: 0,
    remarks: ""
  },
  status: "Active - Current",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

repository.saveState({
  beneficiaries: [dashboardBeneficiary],
  payments: [
    {
      id: "dash-pay-future",
      beneficiaryId: dashboardBeneficiary.id,
      projectTitle: dashboardBeneficiary.project.title,
      paymentDate: "2026-06-01",
      amount: 100,
      method: "Cash",
      referenceNumber: "FUTURE",
      checkDate: "",
      bank: "",
      dateReceived: "2026-06-01",
      dateDeposited: "",
      status: "Received",
      allocations: [{ beneficiaryId: dashboardBeneficiary.id, installmentNumber: 1, amount: 100 }],
      remarks: "",
      archived: false
    },
    {
      id: "dash-pay-cancelled",
      beneficiaryId: dashboardBeneficiary.id,
      projectTitle: dashboardBeneficiary.project.title,
      paymentDate: "2026-06-02",
      amount: 500,
      method: "Cash",
      referenceNumber: "CANCELLED",
      checkDate: "",
      bank: "",
      dateReceived: "2026-06-02",
      dateDeposited: "",
      status: "Cancelled",
      allocations: [{ beneficiaryId: dashboardBeneficiary.id, installmentNumber: 2, amount: 500 }],
      remarks: "Cancelled check",
      archived: false
    },
    {
      id: "dash-pay-pending-pdc",
      beneficiaryId: dashboardBeneficiary.id,
      projectTitle: dashboardBeneficiary.project.title,
      paymentDate: "2026-06-01",
      amount: 300,
      method: "PDC",
      referenceNumber: "PENDING-PDC",
      checkDate: "2026-06-20",
      bank: "",
      dateReceived: "2026-06-01",
      dateDeposited: "",
      status: "Pending",
      allocations: [{ beneficiaryId: dashboardBeneficiary.id, installmentNumber: 2, amount: 300 }],
      remarks: "",
      archived: false
    }
  ],
  receipts: [],
  deferments: [],
  adjustments: [],
  documents: [],
  settings: {},
  activity: []
});

const febSummary = dashboardService.getSummary({ asOf: "2026-02-01" });
const juneSummary = dashboardService.getSummary({ asOf: "2026-06-17" });
assert.equal(febSummary.totalPaid, 0, "dashboard should exclude future payments from historical as-of totals");
assert.equal(febSummary.amountDue, 100, "dashboard amount due should honor the selected as-of date");
assert.equal(juneSummary.totalPaid, 100, "dashboard should include valid payments through the as-of date");
assert.equal(juneSummary.charts.monthlyCollection.at(-1).label, "2026-06", "monthly collection trend should include the as-of month");
assert.equal(juneSummary.charts.monthlyCollection.at(-1).value, 100, "monthly trend should exclude cancelled and pending payments");
assert.equal(juneSummary.activeAccounts, 1, "active account count should include current, past-due, and advance accounts");
assert.equal(juneSummary.charts.byStatus.find((item) => item.label === "Active - Past Due")?.value, 1, "dashboard should derive past-due status from financials");
assert.ok(juneSummary.attention.some((item) => item.type === "Missing OR"), "dashboard attention should include scoped missing OR records");
assert.ok(juneSummary.attention.some((item) => item.type === "PDC nearing date" && item.text === "PENDING-PDC"), "dashboard attention should include pending PDCs nearing check date");

const filteredOutSummary = dashboardService.getSummary({ asOf: "2026-06-17", source: "Shared Service Facilities" });
assert.equal(filteredOutSummary.attention.length, 0, "dashboard attention should respect source/year/status filters");

const monthlyRows = reportService.getPreview("Monthly Collection Report", {
  asOf: "2026-06-17",
  dateFrom: "2026-06-01",
  dateTo: "2026-06-01"
});
assert.equal(monthlyRows.length, 1, "monthly report should honor date range and exclude cancelled payments");
assert.equal(monthlyRows[0].Amount, 100, "monthly report amount should match valid collection amount");

const cancelledReceiptErrors = receiptService.validate({
  beneficiaryId: dashboardBeneficiary.id,
  paymentId: "dash-pay-cancelled",
  orNumber: "OR-CANCELLED",
  orDate: "2026-06-03",
  amount: "500"
});
assert.equal(cancelledReceiptErrors.paymentId, "Selected payment is not eligible for an official receipt.", "returned/cancelled payments should not accept official receipts");

assert.equal(addMonths("2026-06-01", 0), "2026-06-01", "date math should not shift month labels across time zones");

repository.reset();

const allocationBeneficiary = {
  id: "allocation-ben-1",
  firmName: "Allocation Audit",
  proprietor: "Audit Owner",
  address: "",
  municipality: "Vigan City",
  contactNumber: "",
  email: "",
  notes: "",
  project: {
    title: "Allocation Refund",
    spin: "ALLOC-SPIN-001",
    projectYear: 2026,
    sourceOfFund: "Provincial Livelihood Fund",
    officer: "",
    status: ""
  },
  financial: {
    assistanceAmount: 300,
    releaseDate: "2026-01-01",
    projectDurationMonths: 3,
    repaymentStartDate: "2026-01-01",
    originalDueDate: "2026-03-01",
    installments: 3,
    monthlyRefundAmount: 100,
    technologyTransferFee: 0,
    optionToBuyAmount: 0,
    otherFees: 0,
    remarks: ""
  },
  status: "Under Review",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

repository.saveState({
  beneficiaries: [allocationBeneficiary],
  payments: [
    {
      id: "future-allocated-pay",
      beneficiaryId: allocationBeneficiary.id,
      projectTitle: allocationBeneficiary.project.title,
      paymentDate: "2026-01-15",
      amount: 100,
      method: "Cash",
      referenceNumber: "ADVANCE-ONLY",
      checkDate: "",
      bank: "",
      dateReceived: "2026-01-15",
      dateDeposited: "",
      status: "Received",
      allocations: [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 3, amount: 100 }],
      remarks: "",
      archived: false
    }
  ],
  receipts: [],
  deferments: [],
  adjustments: [],
  documents: [],
  settings: {},
  activity: []
});

const allocationFinancials = getBeneficiaryFinancials(allocationBeneficiary.id, "2026-02-01");
assert.equal(allocationFinancials.amountDue, 200, "amount due should sum due installment remaining amounts, not subtract future allocations");
assert.equal(allocationFinancials.pastDue, 100, "past due should begin once the monthly due period has passed");
assert.equal(allocationFinancials.advancePayment, 100, "advance payment should reflect amounts allocated to future installments");
assert.equal(
  beneficiaryService.list({ asOf: "2026-02-01" })[0].status,
  "Active - Past Due",
  "derived status should surface monthly overdue accounts after the due month"
);
assert.equal(
  dashboardService.getSummary({ asOf: "2026-02-01" }).activeAccounts,
  1,
  "dashboard active account count should include monthly overdue accounts"
);

const overAllocationErrors = collectionService.validate(
  { beneficiaryId: allocationBeneficiary.id, paymentDate: "2026-02-02", amount: "150", method: "Cash", status: "Received" },
  [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 1, amount: 150 }]
);
assert.equal(overAllocationErrors.allocations, undefined, "payment validation should allow advance payment across unpaid monthly dues");
assert.deepEqual(
  collectionService.buildAllocations(allocationBeneficiary.id, 150).map((item) => ({ installmentNumber: item.installmentNumber, amount: item.amount })),
  [
    { installmentNumber: 1, amount: 100 },
    { installmentNumber: 2, amount: 50 }
  ],
  "advance payments should be auto-allocated chronologically across unpaid installments"
);
assert.equal(
  collectionService.validate(
    { beneficiaryId: allocationBeneficiary.id, paymentDate: "2026-02-02", amount: "250", method: "Cash", status: "Received" },
    []
  ).amount,
  "Amount paid cannot exceed the total remaining balance.",
  "payment validation should reject payments above the total remaining balance"
);

const scopedReconciliationRows = reportService.getPreview("Payment and OR Reconciliation", { asOf: "2026-02-01", source: "Shared Service Facilities" });
assert.equal(scopedReconciliationRows.length, 0, "reconciliation report should respect beneficiary filters");

const invalidApiPayment = {
  id: "api-invalid-payment",
  beneficiaryId: allocationBeneficiary.id,
  paymentDate: "2026-02-02",
  amount: 200,
  method: "Cash",
  status: "Received",
  allocations: [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 1, amount: 100 }]
};
assert.equal(
  validateRecord("payments", invalidApiPayment, repository.getSnapshot()),
  "Payment allocations must equal payment amount.",
  "server validation should reject inconsistent payment allocations"
);
const overAllocatedApiPayment = {
  id: "api-overallocated-payment",
  beneficiaryId: allocationBeneficiary.id,
  paymentDate: "2026-02-02",
  amount: 150,
  method: "Cash",
  status: "Received",
  allocations: [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 1, amount: 150 }]
};
assert.equal(
  validateRecord("payments", overAllocatedApiPayment, repository.getSnapshot()),
  "",
  "server validation should allow advance-payment allocation as long as total remaining balance is not exceeded"
);
assert.equal(
  collectionService.validate(
    { beneficiaryId: allocationBeneficiary.id, paymentDate: "2026-99-99", amount: "100", method: "Cash", status: "Received" },
    [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 1, amount: 100 }]
  ).paymentDate,
  "Payment date is invalid.",
  "payment form validation should reject impossible ISO dates"
);
assert.equal(
  receiptService.validate({
    beneficiaryId: allocationBeneficiary.id,
    paymentId: "future-allocated-pay",
    orNumber: "OR-BAD-DATE",
    orDate: "2026-02-31",
    amount: "100"
  }).orDate,
  "Official receipt date is invalid.",
  "receipt form validation should reject impossible ISO dates"
);
assert.equal(
  defermentService.validate({
    beneficiaryId: allocationBeneficiary.id,
    requestDate: "2026-02-01",
    startDate: "2026-13-01",
    endDate: "2026-03-01",
    months: "1",
    reason: "Date validation"
  }).startDate,
  "Start date is invalid.",
  "deferment form validation should reject impossible ISO dates"
);
assert.equal(
  adjustmentService.validate({
    beneficiaryId: allocationBeneficiary.id,
    type: "Added Fee",
    effectiveDate: "2026-00-10",
    amount: "10",
    reason: "Date validation"
  }).effectiveDate,
  "Effective date is invalid.",
  "adjustment form validation should reject impossible ISO dates"
);
assert.equal(
  validateRecord(
    "payments",
    {
      id: "api-invalid-date-payment",
      beneficiaryId: allocationBeneficiary.id,
      paymentDate: "2026-02-31",
      amount: 100,
      method: "Cash",
      status: "Received",
      allocations: [{ beneficiaryId: allocationBeneficiary.id, installmentNumber: 1, amount: 100 }]
    },
    repository.getSnapshot()
  ),
  "Payment date must be a valid ISO date.",
  "server validation should reject impossible ISO dates, not just malformed dates"
);
assert.equal(
  validateRecord(
    "receipts",
    {
      id: "api-pending-receipt",
      beneficiaryId: dashboardBeneficiary.id,
      paymentId: "dash-pay-pending-pdc",
      orNumber: "OR-PENDING",
      orDate: "2026-06-20",
      amount: 300
    },
    {
      ...repository.getSnapshot(),
      beneficiaries: [dashboardBeneficiary],
      payments: [
        {
          id: "dash-pay-pending-pdc",
          beneficiaryId: dashboardBeneficiary.id,
          paymentDate: "2026-06-01",
          amount: 300,
          method: "PDC",
          status: "Pending",
          allocations: [{ beneficiaryId: dashboardBeneficiary.id, installmentNumber: 2, amount: 300 }]
        }
      ],
      receipts: []
    }
  ),
  "Receipt payment is not eligible for an official receipt.",
  "server validation should reject official receipts for pending payments"
);

repository.reset();

const deferredAuditBeneficiary = {
  ...allocationBeneficiary,
  id: "deferment-asof-ben",
  firmName: "Deferment As-Of Audit",
  project: { ...allocationBeneficiary.project, spin: "DEF-ASOF-001" },
  financial: {
    ...allocationBeneficiary.financial,
    repaymentStartDate: "2026-01-01",
    originalDueDate: "2026-03-01",
    installments: 3,
    monthlyRefundAmount: 100
  }
};

repository.saveState({
  beneficiaries: [deferredAuditBeneficiary],
  payments: [],
  receipts: [],
  deferments: [
    {
      id: "future-approved-deferment",
      beneficiaryId: deferredAuditBeneficiary.id,
      requestDate: "2026-03-15",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      months: 1,
      reason: "Externally approved after the historical reporting date",
      approvalDate: "2026-03-20",
      approvedBy: "Approver",
      status: "Approved Externally",
      remarks: "",
      archived: false
    }
  ],
  adjustments: [],
  documents: [],
  settings: {},
  activity: []
});

const beforeApprovalFinancials = getBeneficiaryFinancials(deferredAuditBeneficiary.id, "2026-02-15");
assert.equal(
  beforeApprovalFinancials.adjustedDueDate,
  "2026-03-01",
  "future-approved deferments should not change historical adjusted due dates"
);
assert.notEqual(
  getSchedule(deferredAuditBeneficiary.id, "2026-02-15")[1].status,
  "Deferred",
  "future-approved deferments should not mark historical schedule rows as deferred"
);
const afterApprovalFinancials = getBeneficiaryFinancials(deferredAuditBeneficiary.id, "2026-03-21");
assert.equal(afterApprovalFinancials.adjustedDueDate, "2026-04-01", "approved deferments should extend due date once effective");

repository.reset();

const commonCooperatorForm = {
  firmName: "Non SETUP Training Firm",
  cooperatorName: "Training Owner",
  sex: "Female",
  birthDate: "1985-01-01",
  isPwd: "No",
  isIndigenousPeople: "No",
  contactNumber: "09171234567",
  email: "training@example.com",
  completeAddress: "Vigan City",
  municipality: "Vigan City",
  businessType: "Sole Proprietorship",
  businessSector: "Food Processing",
  services: [{ category: "Trainings/Seminars", subtype: "", dateAvailed: "2026-01-01", remarks: "" }]
};
const nonSetupErrors = beneficiaryService.validate(commonCooperatorForm);
assert.equal(nonSetupErrors.projectTitle, undefined, "non-SETUP services should not require SETUP project title");
assert.equal(nonSetupErrors.fundAssistance, undefined, "non-SETUP services should not require SETUP fund assistance");
assert.equal(nonSetupErrors.services, undefined, "non-SETUP services without subtype should be valid when no subtype is configured");

const setupMissingErrors = beneficiaryService.validate({
  ...commonCooperatorForm,
  services: [{ category: "SETUP", subtype: "", dateAvailed: "2026-01-01", remarks: "" }]
});
assert.equal(setupMissingErrors.projectTitle, undefined, "SETUP project title is temporarily optional");
assert.equal(setupMissingErrors.officer, undefined, "SETUP assigned project officer is temporarily optional");
assert.equal(setupMissingErrors.services, "Select a SETUP phase for service 1.", "SETUP service should still keep a system-managed phase identity");

const setupBase = {
  proprietor: "Setup Owner",
  address: "Vigan City",
  municipality: "Vigan City",
  contactNumber: "09170000000",
  email: "setup@example.com",
  notes: "",
  services: [{ category: "SETUP", subtype: "", dateAvailed: "2026-01-01", remarks: "" }],
  business: { municipality: "Vigan City", district: "1st District", businessSector: "Food Processing" },
  cooperator: { name: "Setup Owner" },
  setup: {
    projectTitle: "SETUP Project",
    yearAwarded: 2026,
    assignedProjectOfficer: "Officer A",
    manualStatus: "",
    financial: {
      fundAssistance: 300,
      monthlyRefund: 100,
      refundStart: "2026-01-01",
      refundEnd: "2026-03-01",
      numberOfMonths: 3
    }
  },
  project: {
    title: "SETUP Project",
    spin: "",
    projectYear: 2026,
    sourceOfFund: "SETUP",
    officer: "Officer A",
    status: ""
  },
  financial: {
    assistanceAmount: 300,
    releaseDate: "2026-01-01",
    projectDurationMonths: 3,
    repaymentStartDate: "2026-01-01",
    originalDueDate: "2026-03-01",
    installments: 3,
    monthlyRefundAmount: 100,
    technologyTransferFee: 0,
    optionToBuyAmount: 0,
    otherFees: 0,
    remarks: ""
  },
  status: "Active - Current",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const activeSetup = { ...setupBase, id: "setup-active", firmName: "Active SETUP Firm", project: { ...setupBase.project, spin: "SETUP-ACTIVE" } };
const completedSetup = { ...setupBase, id: "setup-completed", firmName: "Completed SETUP Firm", project: { ...setupBase.project, spin: "SETUP-COMPLETE" } };
const terminatedSetup = {
  ...setupBase,
  id: "setup-terminated",
  firmName: "Terminated SETUP Firm",
  status: "Terminated",
  setup: { ...setupBase.setup, manualStatus: "Terminated" },
  project: { ...setupBase.project, spin: "SETUP-TERMINATED", status: "Terminated" }
};
const trainingOnly = {
  ...setupBase,
  id: "training-only",
  firmName: "Training Only Firm",
  services: [{ category: "Trainings/Seminars", subtype: "", dateAvailed: "2026-01-01", remarks: "" }],
  setup: { financial: {} },
  project: { title: "", spin: "", projectYear: 2026, sourceOfFund: "", officer: "", status: "" },
  financial: { ...setupBase.financial, assistanceAmount: 0, installments: 0, monthlyRefundAmount: 0 }
};
repository.saveState({
  beneficiaries: [activeSetup, completedSetup, terminatedSetup, trainingOnly],
  payments: [
    {
      id: "active-setup-payment",
      beneficiaryId: activeSetup.id,
      projectTitle: activeSetup.project.title,
      paymentDate: "2026-02-10",
      amount: 100,
      method: "Cash",
      referenceNumber: "ACTIVE-SETUP-PAY",
      checkDate: "",
      bank: "",
      dateReceived: "2026-02-10",
      dateDeposited: "",
      status: "Received",
      allocations: [{ beneficiaryId: activeSetup.id, installmentNumber: 1, amount: 100 }],
      remarks: "",
      archived: false
    },
    {
      id: "completed-setup-payment",
      beneficiaryId: completedSetup.id,
      projectTitle: completedSetup.project.title,
      paymentDate: "2026-01-10",
      amount: 300,
      method: "Cash",
      referenceNumber: "COMPLETED-SETUP-PAY",
      checkDate: "",
      bank: "",
      dateReceived: "2026-01-10",
      dateDeposited: "",
      status: "Received",
      allocations: [
        { beneficiaryId: completedSetup.id, installmentNumber: 1, amount: 100 },
        { beneficiaryId: completedSetup.id, installmentNumber: 2, amount: 100 },
        { beneficiaryId: completedSetup.id, installmentNumber: 3, amount: 100 }
      ],
      remarks: "",
      archived: false
    },
    {
      id: "terminated-setup-payment",
      beneficiaryId: terminatedSetup.id,
      projectTitle: terminatedSetup.project.title,
      paymentDate: "2026-02-10",
      amount: 100,
      method: "Cash",
      referenceNumber: "TERMINATED-SETUP-PAY",
      checkDate: "",
      bank: "",
      dateReceived: "2026-02-10",
      dateDeposited: "",
      status: "Received",
      allocations: [{ beneficiaryId: terminatedSetup.id, installmentNumber: 2, amount: 100 }],
      remarks: "",
      archived: false
    }
  ],
  receipts: [],
  deferments: [],
  adjustments: [],
  documents: [],
  settings: {},
  activity: []
});
const activeFinancials = getBeneficiaryFinancials(activeSetup.id, "2026-02-20");
const completedFinancials = getBeneficiaryFinancials(completedSetup.id, "2026-02-20");
const terminatedFinancials = getBeneficiaryFinancials(terminatedSetup.id, "2026-02-20");
assert.equal(deriveSetupProjectStatus(activeSetup, activeFinancials, "2026-02-20").status, "Ongoing", "partially paid SETUP project should remain ongoing");
assert.equal(deriveSetupProjectStatus(completedSetup, completedFinancials, "2026-02-20").status, "Completed", "fully paid SETUP project should become completed");
assert.equal(deriveSetupProjectStatus(terminatedSetup, terminatedFinancials, "2026-02-20").status, "Terminated", "terminated SETUP project should remain terminated even with balance");
const setupDashboard = dashboardService.getSetupRefundDashboard({ asOf: "2026-02-20", year: "2026" });
assert.equal(setupDashboard.totalSetupCustomers, 3, "SETUP customer count should include only firms with SETUP service");
assert.equal(setupDashboard.activeSetupRefundCount, 1, "active SETUP refund should exclude completed, terminated, and non-SETUP firms");
assert.equal(setupDashboard.monthlyTarget, 100, "monthly target should use active SETUP monthly refund schedule only");
assert.equal(setupDashboard.monthlyCollection, 100, "monthly collection should use active SETUP collections through as-of date only");
assert.deepEqual(setupDashboard.monthlyPerformance.map((item) => item.monthKey), ["2026-01", "2026-02", "2026-03"], "SETUP refund collection graph should return every generated target month for the selected year");
assert.equal(setupDashboard.monthlyPerformance.find((item) => item.monthKey === "2026-02").target, 100, "monthly performance target should exclude completed and terminated projects");
assert.equal(setupDashboard.monthlyPerformance.find((item) => item.monthKey === "2026-02").actual, 100, "monthly performance actual should exclude completed and terminated projects");

const delinquentDashboard = dashboardService.getSetupRefundDashboard({ asOf: "2026-03-01", year: "2026" });
assert.equal(delinquentDashboard.delinquentPayors[0].firmName, "Active SETUP Firm", "unpaid rows after the due month should create a delinquent payor");
assert.equal(delinquentDashboard.delinquentPayors[0].delayedMonths, 1, "delayed since should be reported as overdue month count only");

assert.equal(
  validateRecord(
    "beneficiaries",
    {
      ...activeSetup,
      id: "api-no-spin",
      project: { ...activeSetup.project, spin: "" }
    },
    { ...repository.getSnapshot(), beneficiaries: [activeSetup] }
  ),
  "",
  "server validation should not require legacy SPIN number for new backend records"
);
assert.equal(
  validateRecord(
    "beneficiaries",
    {
      id: "api-non-setup",
      firmName: "API Training Only",
      proprietor: "Training Owner",
      municipality: "Vigan City",
      project: { title: "", spin: "", projectYear: 2026, sourceOfFund: "", officer: "", status: "" },
      financial: {
        assistanceAmount: 0,
        repaymentStartDate: "",
        originalDueDate: "",
        installments: 0,
        monthlyRefundAmount: 0
      }
    },
    { ...repository.getSnapshot(), beneficiaries: [activeSetup] }
  ),
  "",
  "server validation should not require SETUP refund fields for non-refund service records"
);
assert.equal(
  validateRecord(
    "beneficiaries",
    {
      id: "api-invalid-service",
      firmName: "Invalid Service",
      proprietor: "Owner",
      municipality: "Vigan City",
      services: [{ category: "Invalid Service", subtype: "", dateAvailed: "2026-01-01" }],
      project: { title: "", spin: "", projectYear: 2026, sourceOfFund: "", officer: "", status: "" },
      financial: { assistanceAmount: 0, repaymentStartDate: "", originalDueDate: "", installments: 0, monthlyRefundAmount: 0 },
      status: "Under Review"
    },
    repository.getSnapshot()
  ),
  "Service 1 category is invalid.",
  "server validation should reject invalid service categories"
);
assert.equal(
  validateRecord(
    "beneficiaries",
    {
      id: "api-invalid-subtype",
      firmName: "Invalid Subtype",
      proprietor: "Owner",
      municipality: "Vigan City",
      services: [{ category: "TACS", subtype: "Wrong", dateAvailed: "2026-01-01" }],
      project: { title: "", spin: "", projectYear: 2026, sourceOfFund: "", officer: "", status: "" },
      financial: { assistanceAmount: 0, repaymentStartDate: "", originalDueDate: "", installments: 0, monthlyRefundAmount: 0 },
      status: "Under Review"
    },
    repository.getSnapshot()
  ),
  "Service 1 subtype is invalid.",
  "server validation should reject invalid service subtypes"
);
assert.equal(
  validateRecord(
    "beneficiaries",
    {
      ...activeSetup,
      id: "api-invalid-project-status",
      project: { ...activeSetup.project, status: "Stalled" }
    },
    repository.getSnapshot()
  ),
  "Project status is invalid.",
  "server validation should reject invalid project statuses"
);
assert.equal(
  validateRecord(
    "payments",
    {
      id: "api-invalid-status-payment",
      beneficiaryId: activeSetup.id,
      paymentDate: "2026-02-10",
      amount: 100,
      method: "Cash",
      status: "Invalid",
      allocations: [{ beneficiaryId: activeSetup.id, installmentNumber: 2, amount: 100 }]
    },
    repository.getSnapshot()
  ),
  "Payment status is invalid.",
  "server validation should reject invalid payment statuses"
);
assert.equal(
  validateRecord(
    "payments",
    {
      id: "api-invalid-secondary-date-payment",
      beneficiaryId: activeSetup.id,
      paymentDate: "2026-02-10",
      amount: 100,
      method: "Cash",
      status: "Received",
      checkDate: "2026-02-31",
      allocations: [{ beneficiaryId: activeSetup.id, installmentNumber: 2, amount: 100 }]
    },
    repository.getSnapshot()
  ),
  "Payment secondary dates must be valid ISO dates.",
  "server validation should reject impossible secondary payment dates"
);
assert.equal(
  validateRecord(
    "adjustments",
    {
      id: "api-invalid-adjustment-type",
      beneficiaryId: activeSetup.id,
      type: "Invalid",
      effectiveDate: "2026-02-10",
      amount: 10,
      reason: "Validation"
    },
    repository.getSnapshot()
  ),
  "Adjustment type is invalid.",
  "server validation should reject invalid adjustment types"
);

repository.reset();

console.log("Smoke tests passed.");
