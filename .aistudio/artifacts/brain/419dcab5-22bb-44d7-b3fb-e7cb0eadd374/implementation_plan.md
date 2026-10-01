# Grace Community Church — Contribution & Stewardship Financial Platform

A comprehensive, production-grade church stewardship and giving management platform. The application provides a warm, reverent, and trustworthy donor-facing giving experience alongside an enterprise-grade administrative dashboard featuring real-time financial reporting, donor relationship management (CRM), automated IRS 501(c)(3) tax receipts, Stripe payment processing with recurring gifts, role-based access control (RBAC), multi-factor authentication (MFA), GDPR/CCPA compliance, immutable audit logging, and developer API documentation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The platform is architected with dual interfaces:
> 1. **Public Donor Sanctuary**: Intuitive, high-trust giving experience supporting one-time and recurring gifts (weekly, bi-weekly, monthly, annual), fund designation (Tithes, Building Fund, Global Missions, Benevolence), processing fee coverage, dedication notes, and instant downloadable PDF-formatted official tax receipts.
> 2. **Stewardship Admin Console**: Secure financial analytics dashboard for pastors, church administrators, and bookkeepers featuring granular RBAC, real-time KPI metrics, donor CRM, transaction audit trails, offline giving sync, GDPR/CCPA data governance, and interactive API documentation.

- **Confirmed Architectural Path**: Full-fidelity client and server mock-persistence architecture with realistic Stripe processing simulator (including test card presets, 3D Secure verification flow, and recurring subscription scheduling), field-level encryption simulation, and downloadable CSV/PDF financial summaries.
- **Design Aesthetic**: Institutional reverence blending archival alabaster canvas (`#FAF8F5` / `#0F172A`), deep navy slate (`#1E293B`), warm gold/brass accents (`#B45309`), and dignified serif headers (`Cinzel` / `Playfair Display`) paired with crisp body typography and tabular-numeral ledger tables.

---

## 1. Overview & Core Concept

### What It Does
- **Donor Giving Portal**: Enables congregants and supporters to give generously via credit/debit card, bank ACH, or mobile wallet with customizable recurring frequencies (Weekly, Every 2 Weeks, Monthly, Annually). Donors can cover processing fees (2.9% + $0.30), allocate funds to dedicated ministry causes, and immediately receive or download IRS-compliant annual and per-transaction tax deductible receipts.
- **Donor Self-Service Portal**: Donors can manage their active recurring pledges, update payment methods, download annual giving statements for tax filing, and exercise GDPR/CCPA privacy rights.
- **Stewardship & Financial Reporting Dashboard**: Real-time KPI summaries (Total YTD Contributions, Active Recurring Pledges, Average Gift Size, Fund Allocation Distribution, Donor Retention Rate), interactive trend charts, and exportable ledger reports (CSV & printable PDF receipts).
- **Donor Records & CRM**: Filterable donor registry tracking lifetime giving, pledge fulfillment, pledge frequency, contact records, giving statements, and engagement tags.
- **Role-Based Access Control (RBAC) & Security**: Granular roles (Lead Pastor, Executive Director, Financial Administrator, Bookkeeper, Auditor) with permission enforcement, simulated TOTP 2-Factor Authentication (MFA), and session timeout safeguards.
- **Audit Trails & Information Governance**: Immutable event log tracking every financial transaction, receipt generation, role escalation, data export, and donor record modification with cryptographic hash verification.
- **GDPR & CCPA Compliance Hub**: Automated donor consent tracking, encrypted PII data storage indicators, Right-to-be-Forgotten anonymization workflow, and one-click data archive export.
- **Offline Giving Sync**: Service mode allowing staff or ushers to capture in-person envelope/kiosk gifts offline with automatic background sync when reconnected.
- **Comprehensive API Documentation**: Built-in Swagger/OpenAPI style interactive endpoint explorer for integrating with church management software (e.g. Planning Center, Breeze, Elvanto) and accounting software (QuickBooks, Xero).

### Target Audience & Persona
- **Donors & Congregants**: Church members seeking a seamless, reverent, and secure way to tithe and view giving history.
- **Church Leadership & Pastors**: Stewards needing high-level visual health metrics on generosity trends, ministry funding, and campaign goals.
- **Finance Committee & Bookkeepers**: Accounting professionals requiring exact reconciliation, exportable CSVs, batch gift entry, and audit logs.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Donor Giving Flow**:
   - Select gift type: One-Time or Recurring (Weekly, Bi-Weekly, Monthly, Annually).
   - Choose or enter amount ($50, $100, $250, $500, Custom) + optional 2.9% fee coverage checkbox.
   - Designate fund (General Tithes & Offerings, Faith Building Campaign, Global Missions & Relief, Community Benevolence).
   - Enter donor details (Name, Email, Tax Mailing Address) + optional Memorial/Dedication Note.
   - Enter simulated Stripe Card / ACH details or click one-click test card presets (Success, Decline, 3D Secure).
   - Instant Confirmation screen with official IRS 501(c)(3) tax receipt, printable voucher, and email delivery status.
2. **Admin Dashboard Experience**:
   - Authenticate with simulated MFA (TOTP 6-digit code).
   - View high-level Financial Health: Total Contributions YTD, Recurring Monthly Run-Rate, Fund Breakdown, Donor Count.
   - Dive into Transaction Ledger: Search by donor, fund, date range, payment method; issue refunds or resend receipts.
   - Access Donor CRM: View individual giving profiles, lifetime gifts, annual giving statements, and pledge progress.
   - Review Audit Log: Real-time security stream tracking all admin actions, access events, and data exports.
   - API Docs & Settings: Test API endpoints, manage church tax entity details (EIN, 501(c)(3) registration, address), and manage RBAC roles.
3. **Mobile & Offline Mode**:
   - Fully responsive responsive navigation, drawer menu on mobile, touch-friendly keypad inputs.
   - Offline sync status pill detecting offline connectivity, queueing local gifts, and syncing with one tap.

### Visual Identity & Theme
- **Color Palette**:
  - Dominant Canvas: Soft Archival Warm Slate / Alabaster (`#FBF9F6` light, `#0F172A` dark)
  - Structural Panels: Pure white / deep navy cards (`#FFFFFF` light, `#1E293B` dark) with delicate borders (`border-stone-200 dark:border-slate-800`)
  - Spiritual & Curatorial Accents: Warm Brass/Gold (`#B45309` / `#D97706`), Deep Royal Navy (`#1E3A8A`), Sage Olive (`#15803D`)
- **Typography**:
  - Display / Headings: High-contrast serif with dignity (`Playfair Display` / `Cinzel` styling)
  - Body & Form Controls: Clean legible contemporary sans (`Plus Jakarta Sans` / system sans)
  - Financial Metrics & Tables: Tabular monospace figures (`font-mono tabular-nums`)
- **Top Bar Contract**:
  - Zone 1: Single brand wordmark (`Grace Community Church` with cross icon)
  - Zone 2: Navigation links (`Give Now`, `My Giving`, `Ministries & Funds`, `Stewardship Admin`, `API Docs`)
  - Zone 3: Dark Mode toggle + Role Switcher / MFA Status

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Interactive Stripe Gateway Simulator vs Live Key Requirement**
  - *Chosen Approach*: Interactive Stripe payment gateway simulation pre-loaded with realistic test cards, 3D Secure verification modal, and webhook event simulator, with an option in Settings to supply a live/test Stripe Publishable Key if desired.
  - *Why*: Ensures zero setup friction in AI Studio preview while maintaining 100% production fidelity for receipt generation, card validation, error states, and recurring subscription schedules.
- **Decision 2: Comprehensive State Persistence with LocalStorage + Export**
  - *Chosen Approach*: High-capacity reactive browser persistence pre-seeded with rich, realistic donor records, transactions, funds, audit events, and tax statements, plus instant JSON backup export/restore.
  - *Why*: Allows immediate multi-user role testing, offline simulation, and persistent state transitions across reloads without requiring external server provisioning blockers.
- **Decision 3: IRS 501(c)(3) Compliant Tax Receipt Generator**
  - *Chosen Approach*: Generates printable and downloadable tax receipts with official non-profit language ("No goods or services were provided in exchange for this contribution..."), church EIN, unique receipt serial number, and verification code.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    GRACE COMMUNITY CHURCH GIVING PORTAL                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  [Top Bar Contract: Brand · Clean Navigation · Role & Theme Controls]     │
│                                                                            │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│  │   Donor Giving Flow   │  │   Donor Self-Service  │  │  Offline Kiosk │  │
│  │   - One-Time/Recurring│  │   - Pledge Management │  │  - Envelope log│  │
│  │   - Stripe Processing │  │   - Tax Statements    │  │  - Queue & Sync│  │
│  │   - Instant Receipts  │  │   - GDPR Privacy Hub  │  │  - Auto-retry  │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬───────┘  │
│              │                          │                       │          │
│  ┌───────────┴──────────────────────────┴───────────────────────┴───────┐  │
│  │                       Stewardship State Manager                      │  │
│  │   - Transactions Ledger      - Donor CRM & Profiles                  │  │
│  │   - Funds & Campaigns        - Audit Log & Hash Chain                │  │
│  │   - RBAC & MFA Verification  - GDPR & Erasure Management             │  │
│  └──────────────────────────────────────┬───────────────────────────────┘  │
│                                         │                                  │
│  ┌──────────────────────────────────────┴───────────────────────────────┐  │
│  │               Enterprise Admin & Financial Dashboard                 │  │
│  │   - Real-Time KPIs (YTD, Run-rate, Average Gift, Retention)          │  │
│  │   - Interactive Trend Visualizations & Fund Distribution             │  │
│  │   - CSV / PDF Annual Statements & Transaction Exports                │  │
│  │   - Granular RBAC Permissions & Security Audit Console               │  │
│  │   - Interactive REST API Explorer (Swagger-style documentation)      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Core Entities & Data Model
- **Donation**: `id`, `transactionId`, `donorId`, `donorName`, `donorEmail`, `amount`, `feeCovered`, `totalCharged`, `frequency` (`one-time` | `weekly` | `bi-weekly` | `monthly` | `annually`), `fundId`, `paymentMethod` (`card` | `ach` | `apple_pay`), `cardBrand`, `cardLast4`, `status` (`completed` | `pending` | `refunded`), `dedication`, `isAnonymous`, `receiptNumber`, `receiptUrl`, `timestamp`.
- **Donor**: `id`, `name`, `email`, `phone`, `address`, `lifetimeGiving`, `firstGiftDate`, `lastGiftDate`, `recurringPledgeStatus`, `taxId`, `gdprConsentDate`, `dataEncrypted`.
- **Fund**: `id`, `name`, `description`, `goalAmount`, `currentAmount`, `category`, `active`.
- **AuditLog**: `id`, `timestamp`, `actorId`, `actorName`, `actorRole`, `action`, `resource`, `details`, `ipAddress`, `integrityHash`.
- **ChurchConfig**: `name`, `ein`, `address`, `phone`, `email`, `website`, `currency`, `taxExemptStatus`.

---

## 5. Verification & Completion Criteria

- [ ] Complete donor giving interface with one-time and recurring options, fund designation, fee coverage, and test card presets.
- [ ] Instant IRS 501(c)(3) tax receipt view and PDF/printable format generator.
- [ ] Full admin dashboard with real-time KPI metrics, fund distribution, and interactive charts.
- [ ] Donor CRM with detailed donor profiles, giving history, and annual tax statement generation.
- [ ] Transaction ledger with multi-criteria filtering, search, and CSV export.
- [ ] Role-Based Access Control (Admin, Pastor, Bookkeeper, Donor) with quick-switching and permission gates.
- [ ] Simulated Multi-Factor Authentication (MFA) with TOTP verification modal.
- [ ] Immutable security audit log tracking all actions with integrity hashes.
- [ ] GDPR/CCPA Privacy Center with consent tracking and Right to Erasure / Data Export tools.
- [ ] Offline giving sync mode with persistent queue.
- [ ] Comprehensive interactive API documentation console with sample requests and responses.
- [ ] Mobile-responsive layout, dark mode toggle, and zero console errors.
