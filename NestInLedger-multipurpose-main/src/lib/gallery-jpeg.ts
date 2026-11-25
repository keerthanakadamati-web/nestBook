// Pure byte parsing: safe in browsers and the server runtime. Only processed JPEGs are stored.
export function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("Invalid JPEG photo.");
  let offset = 2; let dimensions: { width: number; height: number } | undefined;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG structure.");
    const marker = bytes[offset + 1]; offset += 2;
    if (marker === 0xda) break;
    const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) throw new Error("Invalid JPEG segment.");
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) throw new Error("Photo metadata must be removed before uploading.");
    if (marker === 0xc0 || marker === 0xc2) dimensions = { height: (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0), width: (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0) };
    offset += length;
  }
  if (!dimensions || !dimensions.width || !dimensions.height) throw new Error("JPEG dimensions are missing.");
  return dimensions;
}