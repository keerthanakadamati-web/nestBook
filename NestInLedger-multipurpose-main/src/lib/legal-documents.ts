export const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEGAL_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export function legalFileError(file: { size: number; type: string }) {
  if (file.size <= 0) return "Choose a file that is not empty.";
  if (file.size > LEGAL_DOCUMENT_MAX_BYTES) return "Maximum file size is 10 MB.";
  if (!LEGAL_DOCUMENT_TYPES.includes(file.type)) return "Choose a PDF, Word document, JPG or PNG.";
  return null;
}