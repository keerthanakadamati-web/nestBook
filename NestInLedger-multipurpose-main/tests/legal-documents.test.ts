import { expect, test } from "bun:test";
import { legalFileError } from "../src/lib/legal-documents";
test("legal files accept PDF, Word and images", () => {
  for (const type of ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"]) expect(legalFileError({ size: 1000, type })).toBeNull();
});
test("legal files are limited to 10 MB", () => {
  expect(legalFileError({ size: 10485760, type: "application/pdf" })).toBeNull();
  expect(legalFileError({ size: 10485761, type: "application/pdf" })).not.toBeNull();
});
test("empty files and unsupported formats are rejected", () => {
  expect(legalFileError({ size: 0, type: "application/pdf" })).not.toBeNull();
  expect(legalFileError({ size: 100, type: "text/html" })).not.toBeNull();
});