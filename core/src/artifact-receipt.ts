import { createHash } from "node:crypto";

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function computeSubjectDigest(options: {
  files?: Record<string, string>;
  digests?: Record<string, string>;
  bytes?: Record<string, Buffer>;
  exclude?: (filePath: string) => boolean;
  prefix?: string;
}): string {
  const files = options.files ?? {};
  const records = Object.keys(files)
    .filter((filePath) => !(options.exclude?.(filePath)))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => {
      const digest = options.digests?.[filePath]
        ?? sha256Hex(options.bytes?.[filePath] ?? files[filePath] ?? "");
      return `${filePath}\0${digest}\n`;
    })
    .join("");
  return sha256Hex(`${options.prefix ?? ""}${records}`);
}

export function receiptOutputsEqual(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}