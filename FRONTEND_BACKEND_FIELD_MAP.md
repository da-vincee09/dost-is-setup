# Frontend / Backend Field Map

This frontend keeps the existing Supabase schema and API contract intact. Internal collection names such as `beneficiaries` and `beneficiary_id` remain for compatibility, while the UI presents records as Cooperators.

## Persisted Through Existing Columns

| Frontend concept | Current frontend key | Existing backend column |
| --- | --- | --- |
| Name of Firm | `business.firmName`, `firmName` | `beneficiaries.firm_name` |
| Name of Cooperator | `cooperator.name`, `proprietor` | `beneficiaries.proprietor` |
| Complete Address | `business.completeAddress`, `address` | `beneficiaries.address` |
| Municipality | `business.municipality`, `municipality` | `beneficiaries.municipality` |
| Contact Number | `cooperator.contactNumber`, `contactNumber` | `beneficiaries.contact_number` |
| Email Address | `cooperator.email`, `email` | `beneficiaries.email` |
| SETUP Project Title | `setup.projectTitle`, `project.title` | `beneficiaries.project_title` |
| Year of Award | `setup.yearAwarded`, `project.projectYear` | `beneficiaries.project_year` |
| Assigned Project Officer | `setup.assignedProjectOfficer`, `project.officer` | `beneficiaries.officer` |
| Project Status | `setup.manualStatus`, `project.status`, `status` | `beneficiaries.project_status`, `beneficiaries.status` |
| SETUP Fund Assistance | `setup.financial.fundAssistance`, `financial.assistanceAmount` | `beneficiaries.assistance_amount` |
| Monthly Refund Based on MOA | `setup.financial.monthlyRefund`, `financial.monthlyRefundAmount` | `beneficiaries.monthly_refund_amount` |
| Monthly Refund Start | `setup.financial.refundStart`, `financial.repaymentStartDate` | `beneficiaries.repayment_start_date` |
| Monthly Refund End | `setup.financial.refundEnd`, `financial.originalDueDate` | `beneficiaries.original_due_date` |
| Number of Refund Months | `setup.financial.numberOfMonths`, `financial.installments` | `beneficiaries.installments` |

Legacy values `project.spin` and `project.sourceOfFund` are preserved for existing records and may appear only in collapsed Legacy Information UI.

## Frontend-Only Until Backend Support Exists

These fields are built, validated, calculated, and displayed in the frontend, but the current Supabase schema has no dedicated columns for them:

- `cooperator.sex`
- `cooperator.birthDate`
- `cooperator.age`
- `cooperator.isSeniorCitizen`
- `cooperator.isPwd`
- `cooperator.isIndigenousPeople`
- `business.district`
- `business.businessType`
- `business.businessSector`
- `business.assets.land`
- `business.assets.building`
- `business.assets.equipment`
- `business.assets.revolvingCapital`
- `business.assets.total`
- `business.enterpriseClassification`
- `services[].category`
- `services[].subtype`
- `services[].dateAvailed`
- `services[].remarks`
- `setup.calculatedStatus`

Backend handoff: add durable storage for the fields above before relying on them after a full Supabase reload. Until then, older records still open safely through fallbacks derived from the existing columns.

## Derived Values

These should remain calculated, not manually stored as source-of-truth values:

- Age from birthday
- Senior Citizen classification from age
- District from `municipalityDistrictMap`
- Total Declared Assets from asset inputs
- Enterprise Classification from total assets
- Number of Refund Months from refund start/end dates
- SETUP Project Status when automatically completed
- Refund schedule statuses, grace-period deadlines, past-due totals, delayed-month counts, and collection rates

