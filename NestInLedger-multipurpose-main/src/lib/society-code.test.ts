import { describe, expect, it } from "vitest";
import { nextSocietyCode } from "./society-code";
describe("society codes", () => {
  it("after s1 comes s2", () => expect(nextSocietyCode(["s1"])).toBe("s2"));
  it("uses highest number", () => expect(nextSocietyCode(["s1", "s7", "s3"])).toBe("s8"));
  it("first society is s1", () => expect(nextSocietyCode([])).toBe("s1"));
});
