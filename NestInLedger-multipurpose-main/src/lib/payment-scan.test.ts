import { describe, expect, it } from "vitest";
import { parsePaymentText } from "./payment-scan";
const payee = { upiId: "labanya@okaxis", name: "Labanya Enclave" };
describe("parsePaymentText", () => {
  it("reads labelled UTR, month and payee", () => {
    const r = parsePaymentText("Paid successfully to Labanya Enclave 23 Nov 2026, 10:15 am UPI Ref No: 418273649201", payee);
    expect(r.date).toBe("2026-11-23");
    expect(r.utr).toBe("418273649201");
    expect(r.month).toEqual({ year: 2026, month: 11 });
    expect(r.payeeMatch).toBe(true);
    expect(r.success).toBe(true);
  });
  it("prefers Transaction ID over UTR and uses the top date", () => {
    const r = parsePaymentText("10:15 am on 23 Nov 2026 Paid to Labanya Enclave Transaction ID T2611231015123456789 UTR: 418273649201 Debited 01 Oct 2026", payee);
    expect(r.utr).toBe("T2611231015123456789");
    expect(r.month).toEqual({ year: 2026, month: 11 });
  });
  it("reads numeric date and flags failed", () => {
    const r = parsePaymentText("Payment failed 05/10/2026 to someone", payee);
    expect(r.month).toEqual({ year: 2026, month: 10 });
    expect(r.failed).toBe(true);
    expect(r.payeeMatch).toBe(false);
  });
});
