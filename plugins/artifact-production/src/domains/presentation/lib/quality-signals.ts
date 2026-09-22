type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};

function textEmWidth(value: string) {
  let width = 0;
  for (const character of value) {
    if (/\s/u.test(character)) width += 0.33;
    else if (/\p{Script=Han}/u.test(character)) width += 1;
    else if (/\p{Letter}|\p{Number}/u.test(character)) width += 0.55;
    else width += 0.5;
  }
  return width;
}

export function estimateTextBox(input: {
  text: string;
  widthIn: number;
  fontSizePt: number;
  lineSpacingMultiple: number;
  marginPt?: number;
  paragraphSpaceAfterPt?: number;
  paragraphCount?: number;
  explicitLines?: number;
}) {
  const marginIn = Math.max(0, input.marginPt ?? 0) / 72;
  const usableWidth = Math.max(0.01, input.widthIn - marginIn * 2);
  const fontSizeIn = input.fontSizePt / 72;
  const capacityEm = usableWidth / fontSizeIn;
  const widthEm = textEmWidth(input.text);
  const estimatedLines = Math.max(
    input.explicitLines ?? 1,
    Math.ceil(widthEm / capacityEm),
  );
  const requiredHeightIn =
    estimatedLines * fontSizeIn * input.lineSpacingMultiple +
    Math.max(0, (input.paragraphCount ?? 1) - 1) *
      ((input.paragraphSpaceAfterPt ?? 0) / 72) +
    marginIn * 2;
  return {
    capacityEm,
    widthEm,
    estimatedLines,
    requiredHeightIn,
    lastLineEm: widthEm % capacityEm || capacityEm,
  };
}

export function fingerprintSimilarity(left: string[], right: string[]) {
  const counts = (values: string[]) => {
    const result = new Map<string, number>();
    for (const value of values)
      result.set(value, (result.get(value) ?? 0) + 1);
    return result;
  };
  const leftCounts = counts(left);
  const rightCounts = counts(right);
  const tokens = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  if (!tokens.size) return 1;
  let intersection = 0;
  let union = 0;
  for (const token of tokens) {
    intersection += Math.min(
      leftCounts.get(token) ?? 0,
      rightCounts.get(token) ?? 0,
    );
    union += Math.max(
      leftCounts.get(token) ?? 0,
      rightCounts.get(token) ?? 0,
    );
  }
  return intersection / union;
}

export function similarLayoutGroups(
  pages: Array<{ index: number; fingerprint: string[] }>,
) {
  const groups: Array<{ pages: number[]; minimumSimilarity: number }> = [];
  const consumed = new Set<number>();
  for (const page of pages) {
    if (consumed.has(page.index)) continue;
    const matches = pages
      .filter(
        (candidate) =>
          candidate.index !== page.index &&
          fingerprintSimilarity(page.fingerprint, candidate.fingerprint) >=
            0.85,
      )
      .map(({ index }) => index);
    if (matches.length < 2) continue;
    const indexes = [page.index, ...matches].sort((a, b) => a - b);
    indexes.forEach((index) => consumed.add(index));
    groups.push({
      pages: indexes,
      minimumSimilarity: Math.min(
        ...matches.map(
          (index) =>
            fingerprintSimilarity(
              page.fingerprint,
              pages.find((candidate) => candidate.index === index)
                ?.fingerprint ?? [],
            ),
        ),
      ),
    });
  }
  return groups;
}

export function headlineRiskSignals(slides: RecordValue[]) {
  const rows = slides.map((slide, offset) => {
    const title = String(slide.displayTitle ?? "");
    const signals: string[] = [];
    const clauses = title
      .split(/[,，:：]/u)
      .map((part) => part.trim())
      .filter(Boolean);
    if (
      clauses.length === 2 &&
      Math.min(...clauses.map((part) => [...part].length)) >= 2 &&
      Math.max(...clauses.map((part) => [...part].length)) /
        Math.min(...clauses.map((part) => [...part].length)) <=
        1.8
    )
      signals.push("balanced-clauses");
    if (/从.+到|不是.+而是|更.+更|from .+ to |not .+ but /iu.test(title))
      signals.push("formulaic-frame");
    const abstractTokens =
      title.match(
        /价值|能力|体系|生态|协同|效率|体验|治理|增长|释放|赋能|驱动|升级|沉淀|累积|闭环|跃迁|重塑|激活|加速|持续|不断|value|capability|ecosystem|synergy|efficiency|experience|governance|growth|enable|empower|transform|compound|accelerate/giu,
      ) ?? [];
    if (new Set(abstractTokens.map((token) => token.toLowerCase())).size >= 2)
      signals.push("abstract-slogan");
    return { page: offset + 1, title, signals };
  });
  const punctuationFamilies = new Map<string, number[]>();
  rows.forEach(({ title }, offset) => {
    const family = Array.from(
      title.matchAll(/[,，:：—-]/gu),
      (match) => match[0],
    ).join("");
    if (!family) return;
    const pages = punctuationFamilies.get(family) ?? [];
    pages.push(offset);
    punctuationFamilies.set(family, pages);
  });
  for (const pages of punctuationFamilies.values())
    if (pages.length >= 3)
      for (const offset of pages)
        rows[offset]?.signals.push("repeated-title-grammar");
  return rows.filter(({ signals }) => signals.length > 0);
}

export function compositionSignals(
  slides: Array<{
    index: number;
    objects: Array<Record<string, unknown>>;
    layoutFingerprint: string[];
  }>,
  storyboardSlides: RecordValue[],
) {
  return slides.map((slide, offset) => {
    const signals: string[] = [];
    const sizeCounts = new Map<string, number>();
    for (const token of slide.layoutFingerprint) {
      const parts = token.split(":");
      const size = parts.slice(-2).join(":");
      sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
    }
    if ([...sizeCounts.values()].some((count) => count >= 3))
      signals.push("equal-object-grid");
    if (
      slide.objects.some((object) => {
        const bounds = record(object.bounds);
        return (
          String(object.name ?? "").startsWith("pptx:text:") &&
          Number(bounds.y) >= 6.25 &&
          Number(bounds.h) <= 0.75
        );
      })
    )
      signals.push("bottom-takeaway-strip");
    if (
      slide.objects.some(
        (object) =>
          object.horizontalAlign === "center" && Number(object.lineBreaks) >= 2,
      )
    )
      signals.push("centered-multiline");
    return {
      page: slide.index,
      logic: record(storyboardSlides[offset]?.visual).logic,
      signals,
    };
  });
}

export function deckRiskSignals(
  composition: Array<{ page: number; logic: unknown; signals: string[] }>,
  headlines: Array<{ page: number; title: string; signals: string[] }>,
  similarGroups: Array<{ pages: number[]; minimumSimilarity: number }>,
  storyboardSlides: RecordValue[],
) {
  const result: Array<{
    id: string;
    severity: "blocking";
    pages: number[];
    evidence: string;
  }> = [];
  const bodyPages = new Set(
    storyboardSlides
      .map((slide, index) => ({ page: index + 1, role: String(slide.role ?? "") }))
      .filter(({ role }) => !["opening", "closing"].includes(role))
      .map(({ page }) => page),
  );
  const consecutiveThree = (pages: number[]) => {
    const sorted = [...new Set(pages)].sort((left, right) => left - right);
    return sorted.some(
      (page, index) =>
        sorted[index + 1] === page + 1 && sorted[index + 2] === page + 2,
    );
  };
  const dominant = (pages: number[]) =>
    pages.length >= 3 &&
    (consecutiveThree(pages) || pages.length / bodyPages.size >= 0.6);
  const repeatedFrame = similarGroups
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => bodyPages.has(page)),
    }))
    .filter((group) => dominant(group.pages))
    .sort((left, right) => right.pages.length - left.pages.length)[0];
  if (repeatedFrame)
    result.push({
      id: "repeated-frame",
      severity: "blocking",
      pages: repeatedFrame.pages,
      evidence: `The same payload-frame fingerprint recurs on pages ${repeatedFrame.pages.join(", ")} with minimum similarity ${repeatedFrame.minimumSimilarity.toFixed(2)}.`,
    });
  const bottomTakeawayPages = composition
    .filter(
      (entry) =>
        bodyPages.has(entry.page) &&
        entry.signals.includes("bottom-takeaway-strip"),
    )
    .map(({ page }) => page)
    .sort((left, right) => left - right);
  if (dominant(bottomTakeawayPages))
    result.push({
      id: "repeated-bottom-takeaway",
      severity: "blocking",
      pages: bottomTakeawayPages,
      evidence: `A bottom takeaway strip recurs across pages ${bottomTakeawayPages.join(", ")}.`,
    });
  const headlinePages = headlines
    .filter(({ signals }) =>
      signals.some((signal) =>
        ["formulaic-frame", "abstract-slogan"].includes(signal),
      ),
    )
    .map(({ page }) => page)
    .sort((left, right) => left - right);
  if (
    headlinePages.length >= 3 &&
    (consecutiveThree(headlinePages) ||
      headlinePages.length / Math.max(1, storyboardSlides.length) >= 0.4)
  )
    result.push({
      id: "formulaic-headline-chain",
      severity: "blocking",
      pages: headlinePages,
      evidence: `High-confidence formulaic or abstract headline frames recur on pages ${headlinePages.join(", ")}.`,
    });
  return result;
}

export function textFitSignals(
  slides: Array<{
    index: number;
    objects: Array<Record<string, unknown>>;
  }>,
) {
  const result: Array<{
    page: number;
    kind: "overflow" | "orphan-line-risk";
    object: string;
    estimatedLines?: number;
    requiredHeightIn?: number;
  }> = [];
  for (const slide of slides) {
    for (const object of slide.objects) {
      const name = String(object.name ?? "");
      const text = String(object.text ?? "");
      const bounds = record(object.bounds);
      const fontSizePt = Number(object.fontSizePt);
      const lineSpacing = Number(object.lineSpacingMultiple);
      if (
        !/^pptx:(?:title|text|list|item|node|matrix|comparison|metric):/u.test(
          name,
        ) ||
        !text ||
        !Number.isFinite(fontSizePt) ||
        !Number.isFinite(lineSpacing) ||
        Number(bounds.w) <= 0 ||
        Number(bounds.h) <= 0
      )
        continue;
      const estimate = estimateTextBox({
        text,
        widthIn: Number(bounds.w),
        fontSizePt,
        lineSpacingMultiple: lineSpacing,
        marginPt: Number(object.marginPt ?? 0),
        paragraphSpaceAfterPt: Number(object.paragraphSpaceAfterPt ?? 0),
        paragraphCount: Array.isArray(object.paragraphs)
          ? object.paragraphs.length
          : 1,
        explicitLines: Number(object.lineBreaks ?? 0) + 1,
      });
      if (estimate.requiredHeightIn > Number(bounds.h) * 1.15) {
        result.push({
          page: slide.index,
          kind: "overflow",
          object: name,
          estimatedLines: estimate.estimatedLines,
          requiredHeightIn: estimate.requiredHeightIn,
        });
        continue;
      }
      if (estimate.estimatedLines <= 1) continue;
      const hasHan = /\p{Script=Han}/u.test(text);
      const lastLatinWord = text.match(/[A-Za-z0-9]+$/u)?.[0] ?? "";
      if (
        (hasHan && estimate.lastLineEm <= 2) ||
        (!hasHan && lastLatinWord.length > 0 && lastLatinWord.length < 4)
      )
        result.push({
          page: slide.index,
          kind: "orphan-line-risk",
          object: name,
          estimatedLines: estimate.estimatedLines,
          requiredHeightIn: estimate.requiredHeightIn,
        });
    }
  }
  return result;
}
