export const sourceFunds = [
  "SETUP",
  "Provincial Livelihood Fund",
  "Shared Service Facilities",
  "DTI-Supported Refund Program",
  "Agricultural Enterprise Fund",
  "Special Recovery Assistance"
];

export const municipalities = [
  "Alilem",
  "Banayoyo",
  "Bantay",
  "Burgos",
  "Cabugao",
  "Candon City",
  "Caoayan",
  "Cervantes",
  "Galimuyod",
  "Gregorio del Pilar",
  "Lidlidda",
  "Magsingal",
  "Nagbukel",
  "Narvacan",
  "Quirino",
  "Salcedo",
  "San Emilio",
  "San Esteban",
  "San Ildefonso",
  "San Juan",
  "San Vicente",
  "Santa",
  "Santa Catalina",
  "Santa Cruz",
  "Santa Lucia",
  "Santa Maria",
  "Santiago",
  "Sinait",
  "Sigay",
  "Sugpon",
  "Suyo",
  "Santo Domingo",
  "Tagudin",
  "Vigan City"
];

export const municipalityDistrictMap = {
  Bantay: "1st District",
  Cabugao: "1st District",
  Caoayan: "1st District",
  Magsingal: "1st District",
  "San Ildefonso": "1st District",
  "San Juan": "1st District",
  "San Vicente": "1st District",
  "Santa Catalina": "1st District",
  "Santo Domingo": "1st District",
  Sinait: "1st District",
  "Vigan City": "1st District",
  Alilem: "2nd District",
  Banayoyo: "2nd District",
  Burgos: "2nd District",
  "Candon City": "2nd District",
  Cervantes: "2nd District",
  Galimuyod: "2nd District",
  "Gregorio del Pilar": "2nd District",
  Lidlidda: "2nd District",
  Nagbukel: "2nd District",
  Narvacan: "2nd District",
  Quirino: "2nd District",
  Salcedo: "2nd District",
  "San Emilio": "2nd District",
  "San Esteban": "2nd District",
  Santa: "2nd District",
  "Santa Cruz": "2nd District",
  "Santa Lucia": "2nd District",
  "Santa Maria": "2nd District",
  Santiago: "2nd District",
  Sigay: "2nd District",
  Sugpon: "2nd District",
  Suyo: "2nd District",
  Tagudin: "2nd District"
};

export const businessTypes = [
  "Sole Proprietorship",
  "Cooperative",
  "Corporation"
];

export const businessSectors = [
  "Food Processing",
  "Furniture",
  "Metals & Engineering",
  "ICT",
  "GHD",
  "Agriculture"
];

export const serviceCategories = [
  "SETUP",
  "Trainings/Seminars",
  "TACS",
  "Laboratory Test"
];

export const serviceSubtypes = {
  TACS: [
    "Food Safety",
    "Plant Layout",
    "TNA",
    "Energy Audit",
    "Cleaner Production",
    "TACS from RDI"
  ],
  "Laboratory Test": [
    "Micro Test",
    "Chem Test",
    "Calibration"
  ]
};

export const setupProjectStatuses = [
  "Ongoing",
  "Completed",
  "Terminated"
];

export const yesNoOptions = ["Yes", "No"];

// Record collections intentionally start empty. Backend partners can wire real
// records into the service layer without removing any frontend screens.
export const initialBeneficiaries = [];
export const initialPayments = [];
export const initialReceipts = [];
export const initialDeferments = [];
export const initialAdjustments = [];
export const initialDocuments = [];

export const defaultSettings = {
  organizationName: "DOST IS SETUP PROJECTS",
  officeAddress: "",
  officeContact: "",
  defaultReportHeading: "DOST IS SETUP PROJECTS",
  currencyFormat: "Philippine Peso",
  dateFormat: "MMM DD, YYYY",
  defaultRepaymentMonths: 36,
  preparedBy: "",
  reviewedBy: "",
  approvedBy: "",
  defaultRowsPerTable: 10,
  themePreference: "Light"
};
