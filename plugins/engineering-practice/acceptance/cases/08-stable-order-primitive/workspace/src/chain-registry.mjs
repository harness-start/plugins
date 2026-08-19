export class ChainRegistry {
  static warnings = [];

  constructor(chains) {
    this.chains = chains;
  }

  static clearWarnings() {
    ChainRegistry.warnings = [];
  }

  get stages() {
    let combined = this.chains[0] ?? [];
    for (const chain of this.chains.slice(1)) combined = ChainRegistry.combine(combined, chain);
    return combined;
  }

  static combine(left, right) {
    const result = [...left];
    let insertion = left.length;
    for (const stage of [...right].reverse()) {
      const index = result.indexOf(stage);
      if (index === -1) {
        result.splice(insertion, 0, stage);
      } else {
        if (index > insertion) ChainRegistry.warnings.push("cycle in chains");
        insertion = index;
      }
    }
    return result;
  }
}
