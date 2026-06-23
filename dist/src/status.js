export const accountStatuses = [
  "Not Yet Started",
  "Active - Current",
  "Active - Past Due",
  "Active - Advance Payment",
  "Deferred",
  "Under Review",
  "Compromise Agreement",
  "Ongoing",
  "Completed",
  "Terminated",
  "Withdrawn",
  "Fully Paid",
  "Closed",
  "Archived"
];

export const paymentStatuses = [
  "Received",
  "Pending",
  "Deposited",
  "Cleared",
  "Returned",
  "Replaced",
  "Cancelled"
];

export const reconciliationStatuses = [
  "Matched",
  "Missing OR",
  "Amount Mismatch",
  "Duplicate OR",
  "Needs Review"
];

export const statusConfig = {
  "Not Yet Started": { tone: "neutral", help: "Repayment has not started." },
  "Active - Current": { tone: "success", help: "Account is active and current." },
  "Active - Past Due": { tone: "danger", help: "Account has overdue installments." },
  "Active - Advance Payment": { tone: "info", help: "Account has advance payments." },
  Deferred: { tone: "warning", help: "Account has an active deferment record." },
  "Under Review": { tone: "review", help: "Account needs staff review." },
  "Compromise Agreement": { tone: "purple", help: "Account has adjusted repayment terms." },
  Terminated: { tone: "danger", help: "Project was terminated." },
  Withdrawn: { tone: "danger", help: "Project was withdrawn." },
  "Fully Paid": { tone: "success", help: "Repayable amount has been fully collected." },
  Closed: { tone: "neutral", help: "Account is closed." },
  Archived: { tone: "neutral", help: "Record is archived." },
  Upcoming: { tone: "neutral", help: "Installment is not yet due." },
  Due: { tone: "warning", help: "Installment is due." },
  "Partially Paid": { tone: "info", help: "Installment has partial allocation." },
  Paid: { tone: "success", help: "Installment is paid." },
  Overdue: { tone: "danger", help: "Installment is overdue." },
  "No Payment Yet": { tone: "neutral", help: "No valid payment has been recorded yet." },
  "Due This Month": { tone: "warning", help: "The current monthly due still has unpaid balance." },
  "Partially Paid This Month": { tone: "warning", help: "Partial payment has been recorded, but the expected due is not fully covered." },
  "Paid for This Month": { tone: "success", help: "Payments cover the expected due as of the selected month." },
  "Advance Payment": { tone: "info", help: "Payments exceed the expected due as of the selected month." },
  "Overdue / Delinquent": { tone: "danger", help: "One or more monthly obligations are overdue." },
  Adjusted: { tone: "purple", help: "Installment was adjusted." },
  Cancelled: { tone: "neutral", help: "Record is cancelled." },
  Received: { tone: "info", help: "Payment was received." },
  Pending: { tone: "warning", help: "Payment is pending." },
  Deposited: { tone: "info", help: "Payment was deposited." },
  Cleared: { tone: "success", help: "Payment has cleared." },
  Returned: { tone: "danger", help: "Payment was returned." },
  Replaced: { tone: "purple", help: "Payment was replaced." },
  Matched: { tone: "success", help: "Payment and receipt match." },
  "Missing OR": { tone: "danger", help: "Payment has no official receipt." },
  "Amount Mismatch": { tone: "warning", help: "Payment and receipt amounts differ." },
  "Duplicate OR": { tone: "danger", help: "Official receipt number appears more than once." },
  "Needs Review": { tone: "review", help: "Record should be reviewed." },
  "Pending Documentation": { tone: "warning", help: "Supporting documents are incomplete." },
  "Approved Externally": { tone: "success", help: "Approval was completed outside the system." },
  "Rejected Externally": { tone: "danger", help: "External approval was rejected." },
  Ongoing: { tone: "info", help: "SETUP project is active with refundable balance." },
  Completed: { tone: "success", help: "SETUP project has been fully paid." }
};
