/**
 * @typedef {'Not Yet Started'|'Active - Current'|'Active - Past Due'|'Active - Advance Payment'|'Deferred'|'Under Review'|'Compromise Agreement'|'Terminated'|'Withdrawn'|'Fully Paid'|'Closed'|'Archived'} AccountStatus
 * @typedef {'Cash'|'Check'|'PDC'|'PMO'|'Bank Deposit'|'Bank Transfer'|'Other'} PaymentMethod
 * @typedef {'Received'|'Pending'|'Deposited'|'Cleared'|'Returned'|'Replaced'|'Cancelled'} PaymentStatus
 * @typedef {'Matched'|'Missing OR'|'Amount Mismatch'|'Duplicate OR'|'Needs Review'} ReconciliationStatus
 *
 * @typedef {object} ProjectInfo
 * @property {string} title
 * @property {string} spin
 * @property {number} projectYear
 * @property {string} sourceOfFund
 * @property {string} officer
 * @property {string} status
 *
 * @typedef {object} FinancialAssistance
 * @property {number} assistanceAmount
 * @property {string} releaseDate
 * @property {number} projectDurationMonths
 * @property {string} repaymentStartDate
 * @property {string} originalDueDate
 * @property {number} installments
 * @property {number} monthlyRefundAmount
 * @property {number} technologyTransferFee
 * @property {number} optionToBuyAmount
 * @property {number} otherFees
 * @property {string} remarks
 *
 * @typedef {object} CooperatorRecord
 * @property {string} id
 * @property {string} firmName
 * @property {string} proprietor
 * @property {string} address
 * @property {string} municipality
 * @property {string} contactNumber
 * @property {string} email
 * @property {string} notes
 * @property {ProjectInfo} project
 * @property {FinancialAssistance} financial
 * @property {AccountStatus} status
 * @property {boolean} archived
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {object} PaymentAllocation
 * @property {string} beneficiaryId
 * @property {number} installmentNumber
 * @property {number} amount
 *
 * @typedef {object} Payment
 * @property {string} id
 * @property {string} beneficiaryId
 * @property {string} projectTitle
 * @property {string} paymentDate
 * @property {number} amount
 * @property {PaymentMethod} method
 * @property {string} referenceNumber
 * @property {string} checkDate
 * @property {string} bank
 * @property {string} dateReceived
 * @property {string} dateDeposited
 * @property {PaymentStatus} status
 * @property {PaymentAllocation[]} allocations
 * @property {string} remarks
 * @property {boolean} archived
 *
 * @typedef {object} OfficialReceipt
 * @property {string} id
 * @property {string} beneficiaryId
 * @property {string} paymentId
 * @property {string} orNumber
 * @property {string} orDate
 * @property {number} amount
 * @property {number} penaltyAmount
 * @property {string} attachmentName
 * @property {string} remarks
 * @property {boolean} archived
 *
 * @typedef {object} Deferment
 * @property {string} id
 * @property {string} beneficiaryId
 * @property {string} requestDate
 * @property {string} startDate
 * @property {string} endDate
 * @property {number} months
 * @property {string} reason
 * @property {string} approvalDate
 * @property {string} approvedBy
 * @property {string} status
 * @property {string} remarks
 * @property {boolean} archived
 *
 * @typedef {object} AccountAdjustment
 * @property {string} id
 * @property {string} beneficiaryId
 * @property {string} type
 * @property {string} effectiveDate
 * @property {number} amount
 * @property {string} previousValue
 * @property {string} newValue
 * @property {string} reason
 * @property {string} approvedBy
 * @property {string} remarks
 * @property {boolean} archived
 *
 * @typedef {object} DocumentRecord
 * @property {string} id
 * @property {string} category
 * @property {string} beneficiaryId
 * @property {string} projectTitle
 * @property {string} relatedTransaction
 * @property {string} documentDate
 * @property {string} fileName
 * @property {number} fileSize
 * @property {string} fileType
 * @property {string} description
 * @property {boolean} archived
 */

export {};
