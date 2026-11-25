# Editable Maintenance and Reminder Settings

## What will change
- Replace the read-only maintenance section in Settings with monthly amount, effective month, due day and financial-year start month, plus Save and Cancel.
- Add reminder controls for enabled/disabled, start day, time, time zone, daily frequency and payment-confirmation emails. Gmail remains the only delivery service; no new provider or credential changes.
- Show saved values, pending changes and available last-run/email outcomes. A failed or missing Gmail connection will be shown as an error, never as a successful send.

## Preserve billing history
- Keep ₹1,500 as the historical baseline and preserve existing balances at rollout.
- Store approved rates by effective month. New amounts can start only in a future month; pending or rejected proposals do not affect billing.
- Preserve already-issued monthly charges with a unique flat/month bill record. Capture existing historical charges from the current billing rules without changing payment records or balances.
- Use the applicable month’s approved charge in maintenance statements, owner balances, dashboard totals, reminders and newly prepared reports. Existing saved report snapshots and receipts stay untouched.
- Allow due days 1–31; in shorter months, use the month’s last day. Validate positive amounts, effective months, reminder days/times and supported time zones.
- Apply a changed financial-year start month prospectively, retaining earlier report periods and opening-balance records rather than reassigning them silently.

## Permissions and approval
- Preserve authorized Admin access and President final approval authority.
- Secretary saves create pending proposals using the existing approval/history workflow; only President approval applies them.
- Enforce validation, future-only dates, bill uniqueness and role restrictions in the database, not only on screen.
- Owners cannot edit settings; Treasurer keeps existing finance-only access.
- Keep UPI configuration on Payments. Remove the obsolete maintenance-amount editor there so it cannot bypass effective-month rules.

## Reminder behavior
- Preserve the existing authenticated Gmail callback and its credentials. The current scheduler is an older database job, not a managed HTTP schedule; do not replace its authentication.
- Adapt the existing database scheduling path to check the saved time and time zone on future runs, with defaults of 10:00 AM Asia/Kolkata and start day 4.
- Remind only while outstanding dues remain positive; check again immediately before sending.
- Preserve one reminder per flat per scheduled local date and the atomic email claim. Settings changes must not resend an already-handled date.
- Honor the successful-payment email toggle without changing payment confirmation or receipt rules.
- Record execution and sending outcomes accurately; Gmail acceptance is not a delivery confirmation.

## Technical approach
- Add effective-dated configuration and protected monthly charge storage through additive database changes, with explicit grants and row-level access policies.
- Extend existing proposal field allowlists, snapshots and atomic President application for configuration changes.
- Centralize month-specific billing and financial-year rules across existing calculations; do not introduce another payment or accounting system.
- Keep scheduling and Gmail calls server-side, using the existing SQL-only scheduling path because the current job is unmanaged.
- Reuse the existing Settings layout and form controls. No redesign or unrelated modules.

## Verification
- Test Admin save/cancel, Secretary proposal, President approval/rejection and unauthorized edits with separate accounts.
- Verify future rates, unchanged historical charges/balances/reports, pending-rate isolation and duplicate-bill prevention.
- Test reminder enablement, local time/day gating, changed settings on future runs, unpaid-only selection, payment stopping, duplicate prevention and accurate failure statuses.
- Test notification logic without emailing owners or tenants during verification; verify the existing Gmail connection separately without claiming delivery.
- Run existing payment, approval, permission and financial-report regressions, then check the Settings and approval screens in the browser.

## Remaining account setup
Real President, Secretary and Treasurer assignments still require identifying their accounts; verification can use temporary role accounts that are removed afterward.