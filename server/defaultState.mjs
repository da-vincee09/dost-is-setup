export const defaultSettings = {
  organizationName: "",
  officeAddress: "",
  officeContact: "",
  defaultReportHeading: "",
  currencyFormat: "Philippine Peso",
  dateFormat: "MMM DD, YYYY",
  defaultRepaymentMonths: 36,
  preparedBy: "",
  reviewedBy: "",
  approvedBy: "",
  defaultRowsPerTable: 10,
  themePreference: "Light"
};

export const emptyState = {
  beneficiaries: [],
  payments: [],
  receipts: [],
  deferments: [],
  adjustments: [],
  documents: [],
  settings: defaultSettings,
  activity: []
};

export const collectionNames = new Set([
  "beneficiaries",
  "payments",
  "receipts",
  "deferments",
  "adjustments",
  "documents",
  "activity"
]);
