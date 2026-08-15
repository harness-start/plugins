export function deliveryIgnoreForbidden(line: string, options: { mediaGlob?: string } = {}): boolean {
  const text = String(line ?? "").trim();
  if (!text || text.startsWith("#")) return false;
  const media = options.mediaGlob ?? "(?:png|svg|pdf|pptx|mp4|wav)";
  return /(?:^|\/)(?:build|dist|proofs?|evidence|review|release|receipt)(?:\/|$|\.)/iu.test(text)
    || new RegExp(`\\*\\.${media}$`, "iu").test(text);
}