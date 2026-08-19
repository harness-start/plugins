export class Pipeline {
  static warnings = [];

  static clearWarnings() {
    Pipeline.warnings.length = 0;
  }

  constructor(groups = []) {
    this.groups = groups;
  }

  get stages() {
    let combined = this.groups[0] ?? [];
    for (const group of this.groups.slice(1)) combined = Pipeline.combine(combined, group);
    return combined;
  }

  static combine(left, right) {
    const combined = [...left];
    let insertion = left.length;
    for (const stage of [...right].reverse()) {
      const index = combined.indexOf(stage);
      if (index === -1) {
        combined.splice(insertion, 0, stage);
      } else {
        if (index > insertion) Pipeline.warnings.push(`opposite stage order: ${combined[insertion]} / ${stage}`);
        insertion = index;
      }
    }
    return combined;
  }
}
