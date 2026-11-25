<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Shared signed-in navigation lives in the authenticated layout using the existing sidebar primitives; all signed-in pages inherit it without altering their actions or guards.
- Navigation uses the existing session role only for display and links only to existing destinations; unavailable pages stay disabled.
- All page-level controls share app-ui wrappers backed by the UI Button primitive; global semantic tokens own visual roles so redesigns cannot change permissions or financial formulas.
- Dedicated administrative pages share existing bounded editing/approval forms, not the dashboard body; payment configuration lives only on Payments and Documents projects the existing authorized report records. Admin, President and Secretary share working module links; absent modules stay disabled.
- Maintenance statements use immutable unique flat/month charges and approved effective-month rates; the shared billing helpers project unissued periods without persisting duplicate bills. Corporate Fund history uses the same receipts and expenses as its existing accounting formula.
- Maintenance and reminder configuration use the society-settings approval adapter and database validation; Gmail hooks preserve hook-token authentication and distinguish provider acceptance from delivery. Approved time/timezone updates reschedule the existing daily job through a database trigger, not a polling job; seasonal timezone offsets need reconfirmation because this legacy scheduler uses UTC.
- Database has_permission is the authority for committee access; UI helpers only mirror it. Legacy admin and President can write live records; Secretary changes use saveAdministrativeChange and database submit_change/decide_change; Treasurer remains finance-only: reports and recurring expense proposals use authorized RPCs; recurring live payments require President approval.
- Every administrative mutation must use the shared approval adapter or explicitly authorize privileged operations before loading the admin client; registered module/field allowlists and current-row snapshots keep proposal application bounded and conflict-safe.
- Database decisions (per can_decide_module) atomically apply proposals and append immutable audit events; future public tables receive a fail-closed Secretary write guard and require explicit module registration before supporting proposals.
- Legacy Admin can read proposal and audit history through authenticated RLS and may decide only payment proposals; all other final decisions follow can_decide_module to preserve the approval boundary.
- Owner-login proposals contain only email; the President supplies a temporary password at approval, and the authenticated server function creates/reuses the account with compensating cleanup on failure so secrets never enter proposal history.
- Treasurer account summaries use the narrowly projected finance_accounts view, not full flat/tenant rows, to preserve finance-only access.
- Financial reports are immutable database-generated snapshots with RLS-protected metadata and report-only state transitions; authenticated reads generate PDF/CSV locally, avoiding public files or permanent download URLs. Review never changes live finances; only a different President can explicitly approve a report.
- Role forms resolve registered email through one authenticated server function after database permission checks; mutations reuse existing role/approval RPCs so legacy Admin protections and President-only decisions remain authoritative. Password recovery uses Cloud Auth on a public reset route, never an app-owned reset-token store.
- Complaints use owner-scoped submission/comment RPCs and the existing shared approval adapter for committee changes; private photos use RLS-gated storage and short-lived signed reads, with append-only event history and recipient-scoped Gmail notification outcomes to preserve privacy and approval boundaries.

- Display names live in public.profiles (user_id, full_name), backfilled from flat owner names; the mandatory_committee_approval guard trigger is intentionally dropped on profiles so users can edit their own name; likewise dropped on society_directory (non-financial, committee edits via RLS) — do not re-attach either.

- Recurring expenses use immutable generated schedule snapshots and RPC-only payment transitions; actual approved payments create exactly one existing expense, required private proof precedes payment, and confidential recurring data is restricted to Admin/President/Treasurer. Trigger-only audit rows are exempt from the administrative guard because operational planned generation is not a live financial payment; historical displays use snapshots while schedule editing always loads the current schedule.
- Payment creates use submit_payment and its RPC-only request registry; database triggers reject unregistered creates, and Secretary requests retain the existing President decision flow.
- Flat capacity uses an atomically updated RPC-inaccessible counter and normalized uniqueness at the database boundary, so concurrent imports and approved creates share the same ceiling.
- Accounting uses society-calendar cutoffs, frozen effective-rated bills and explicit oldest-first per-flat settlement; advance credits remain separate and existing report snapshots are never recalculated.
- Subdirectories may have their own AGENTS.md (e.g. src/components); read it before changing files there.
- Web push: VAPID/aes128gcm via Web Crypto, keys derived from VAPID_SEED, notification-only public/push-sw.js (no page caching), owner-scoped device rows and an (event, device)-unique delivery log; free, deduplicated and retry-safe.

- Approval routing lives in database can_decide_module (mirrored by canDecideModule): payment confirmations/proposals go to Treasurer (legacy Admin kept), expense and complaint proposals to President with Secretary as backup (never their own), everything else President-only; decide_change/decide_payment set a transaction flag that the live-change guard honours so approved changes can apply.
- Societies table is Admin-only; flats.society_id defaults to s1 by trigger, keeping existing data intact until per-table isolation.
- Committee board: members read, President/Admin write. Public flat registrations enter only via an anon RPC; only President/Admin convert them to flats, keeping Aadhaar private.
