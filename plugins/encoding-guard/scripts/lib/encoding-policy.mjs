import { isUtf8 } from "node:buffer";

export const BOM_SIGNATURES = [
  { name: "UTF-32 LE BOM", bytes: [0xff, 0xfe, 0x00, 0x00] },
  { name: "UTF-32 BE BOM", bytes: [0x00, 0x00, 0xfe, 0xff] },
  { name: "UTF-8 BOM", bytes: [0xef, 0xbb, 0xbf] },
  { name: "UTF-16 LE BOM", bytes: [0xff, 0xfe] },
  { name: "UTF-16 BE BOM", bytes: [0xfe, 0xff] },
];

function startsWithBytes(buffer, signature) {
  return (
    buffer.length >= signature.length &&
    signature.every((value, index) => buffer[index] === value)
  );
}

export function analyzeEncoding(buffer) {
  if (!buffer || buffer.length === 0) return null;

  for (const signature of BOM_SIGNATURES) {
    if (startsWithBytes(buffer, signature.bytes)) {
      return {
        kind: "bom",
        name: signature.name,
        bytes: signature.bytes
          .map((value) => value.toString(16).toUpperCase().padStart(2, "0"))
          .join(" "),
      };
    }
  }

  if (!isUtf8(buffer)) {
    return { kind: "invalid-utf8" };
  }

  return null;
}
