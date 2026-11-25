# NestLedger accounting fixes

## Findings from existing records

- All **15 flats** exist. No duplicate flat numbers, duplicate monthly bills, blank flat numbers or non-month-start bills were found.
- September, October and November 2026 each have **15 bills totaling ₹22,500**. The approved rate is **₹1,500 per flat**.
- Confirmed receipts total **₹54,000**: September ₹22,500 and October ₹31,500. These are stored receipts, not independently verified bank/cash transactions.
- FY 2026–27 has a recorded opening of **₹1,00,000** and expenses of **₹55,000**. The record-based fund balance through November 2 is **₹99,000**.
- Charges through November total ₹67,500. Keeping every confirmed receipt, per-flat outstanding totals **₹15,000**, with **₹1,500 in separate advance credit**. One flat's credit must not reduce another flat's dues.

### Suspected duplicates: review only

Each pair below contains two ₹1,500 cash receipts dated **October 9, 2026**, with the same declared period, October 2026:

| Flat | Receipt pair |
| --- | --- |
| 201 | LE-1018 and LE-1033 |
| 203 | LE-1019 and LE-1035 |
| 301 | LE-1020 and LE-1021 |
| 402 | LE-1024 and LE-1025 |
| 502 | LE-1028 and LE-1029 |

These are **suspicions, not proven duplicates**. Potentially repeated amount: ₹7,500. Other October payments may be legitimate arrears or advances. Keep every payment and receipt unchanged unless you separately authorize a correction after review. Existing totals continue to include all confirmed records.

## Root causes

1. **Missing flat ceiling:** exact-text uniqueness exists, but there is no database-wide 15-flat limit or protection against whitespace/case variants.
2. **Missing payment retry protection:** repeated cash/UPI submissions create separate rows and receipts. Separate repeated create proposals can both be approved.
3. **Bill generation already deduplicates normal months:** unique flat/date and conflict-safe generation work; month-start validation is still needed to prevent another date within the same month bypassing uniqueness.
4. **Unreliable status and breakdown:** partial status uses a division remainder, not actual allocation. Full current charges beside remaining arrears do not always add up to total due.
5. **Inconsistent cutoffs:** dashboard fund totals cover the entire selected FY, while reports have period/current-date cutoffs. Owner UPI submissions omit actual payment date. Failed reads can silently show zero figures.
6. **Stale owner history:** switching linked flats can briefly show the previous flat's payments and generate a receipt with the wrong selected-flat label.

No evidence was found that outstanding is directly counted as income or that normal monthly generation duplicates arrears.

## Proposed fixes

### 1. Protect all write paths

- Enforce the 15-flat ceiling atomically at the database boundary, including direct requests, imports and approved proposals. Preserve existing flat IDs and relationships.
- Add nonblank, normalized flat-number uniqueness without renaming existing flats.
- Preserve flat/month bill uniqueness; add month-start validation. Keep frozen charges and approved effective-dated rates unchanged.
- Add retry-safe cash and UPI/PhonePe submissions using a persistent request identity. Identical retries return the original result; changed payloads cannot reuse that identity.
- Apply protection to Secretary payment proposals and President approval; bound direct writes so they cannot bypass safeguards.
- Require nonblank unique normalized bank references for new online payments, without altering legacy rows. Preserve legitimate distinct transfers, partial payments, different months and arrears.
- Do not use flat/date/amount alone as payment uniqueness: legitimate payments can match those values. Flag identical fresh cash entries for deliberate review rather than silently crediting them twice.
- Keep opening/returning from UPI or PhonePe separate from confirmation. No gateway webhook currently exists; do not add one. Future retry paths must share the same protection.

### 2. Reconcile all ten dashboard figures and ledgers

- Count confirmed receipts once, on the actual receipt date, with a shared society-date cutoff.
- Calculate each bill once; apply payments oldest-dues-first within the same flat. Derive remaining prior dues, current-month unpaid amount and advance credit explicitly.
- Calculate Paid/Pending this month from the selected month's bill allocation. Do not use division remainders or count not-yet-billable flats as paid bills.
- Use selected month-end for past balances and today for the current month. Future months may project dues, but must not recognize future cash.
- Keep Corporate Fund = recorded FY opening + confirmed receipts − valid recorded expenses. Never count outstanding as cash or invent an opening balance.
- Preserve the existing expense accounting-month policy consistently across dashboard, fund and reports, with date fallback only when the accounting month is absent.
- Keep existing report snapshots immutable. Correct future report generation and expose advance credits where necessary for reconciliation.
- Add actual payment date to owner submissions; distinguish declared period from derived oldest-first allocation.
- Prevent stale month/flat results. Show errors instead of false zero totals and associate each receipt with its payment's own flat.

### 3. Validate without altering financial records

- Add focused tests for the 15-flat ceiling, normalized duplicates, bill-month uniqueness, repeated requests, bank references and legitimate separate payments.
- Test ₹1,500 × 15 = ₹22,500, arrears, partial settlement, credits, receipt-month recognition, pending exclusion, future dates and Corporate Fund arithmetic.
- Reconcile dashboard, individual ledgers, payment history, receipt identities, recorded expenses and future report calculations.
- Use read-only production checks and rollback-only validation of database write rules. Do not run existing suites that create/delete financial fixtures in the shared live database.
- Verify signed-in committee and owner views without submitting new real financial transactions. Report any remaining verification limits.

## Preservation and approval boundaries

No rebuild or redesign. Preserve residents, payment history, receipt numbers, bills, report snapshots, relationships, authentication, owner isolation, role permissions and President approval rules. No financial records will be deleted, merged or corrected during these fixes. No publishing without explicit approval.

## Technical approach

Use additive migrations, existing authenticated clients/RPCs and the shared approval adapter. Add concurrency-safe capacity enforcement and request uniqueness at the database boundary. Share explicit billing/allocation and date-cutoff helpers across existing screens; mirror those rules in database account projections and future report generation. Leave existing immutable report records untouched.
