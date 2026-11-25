# Roadmap

## Unified Settings
- [x] Replace role-specific menu entries with a Settings icon beside the signed-in name
- [x] Make Settings show existing role-appropriate controls without depending on Labanya-only configuration
- [x] Verify Hill View President Settings on mobile and desktop; four role-access tests passed, owner routing checked in tests
- Existing limitation: maintenance/reminder configuration remains primary-society-only; this change does not alter financial configuration or permissions.

## Pilot acknowledgment
- [x] Show terms and require agreement before sign-in; verified mobile/desktop login and 16 acceptance/access tests
- [x] Add versioned first-login terms acceptance with protected timestamp and Admin-only export
- [x] Add blocking agreement screen and Admin settings download
- [x] Verify acceptance persistence and non-Admin export restrictions (13 tests passed; signed-in mobile acceptance and PDF/CSV downloads checked)

## Legal Documents vault
- [x] Add society-isolated private storage and President-only uploads; exclude Admin and residents
- [x] Add Legal Documents view/download in Documents for President, Secretary and Treasurer
- [x] Verify permission tests and signed-in upload/view/download (12 tests passed; mobile and desktop checks; temporary records removed)

## Accounting integrity fixes (2 Nov 2026)
- [x] Report evidenced root causes and proposed safe changes before implementation
- [ ] Enforce 15-flat ceiling, normalized flat uniqueness and retry-safe payment/bill writes
- [ ] Reconcile dashboard, owner ledgers, receipts, expenses and report calculations
- [ ] Show suspected financial duplicates for review without changing records
- [ ] Run rule tests and signed-in end-to-end reconciliation; leave unpublished

## Completed: Premium navy/emerald UI redesign (uploaded spec, 30 Oct 2026)
- [x] Update shared design tokens (navy primary, emerald positive, neutral surfaces)
- [x] Update shared sidebar, buttons, cards, statuses, tables, fields, password and upload controls
- [x] Apply shared styling across existing pages; refine committee/owner headers and financial figure sizing without backend changes
- [x] Verify preview build, all five role navigation boundaries, linked-owner pages, desktop/mobile dashboards, approval decisions, financial report totals and PDF/CSV downloads
- [x] Keep unpublished for user review

### Verification notes
- 19 unit tests passed; approval and report integration tests passed; all-role sidebar test passed after correcting outdated Treasurer navigation expectations.
- Secretary proposals, President-only decisions and owner isolation verified with temporary records; tests removed their fixtures.
- Login password visibility and reset-screen navigation checked; no real reset email requested.
- Desktop chart and 390px dashboards inspected; no dashboard page-level horizontal overflow. Not every modal and page was separately inspected at every screen size.

## Done
- Recurring expenses verified (360 checks, ₹46,500 preserved)
