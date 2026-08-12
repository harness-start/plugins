class OrderPlan {
  constructor(sequence = []) {
    this._sequences = [sequence];
  }

  plus(other) {
    const combined = new OrderPlan();
    combined._sequences = [...this._sequences, ...other._sequences];
    return combined;
  }

  get resolved() {
    let result = this._sequences[0] || [];
    for (const sequence of this._sequences.slice(1)) {
      result = OrderPlan.merge(result, sequence);
    }
    return result;
  }

  static merge(left, right) {
    return [...left, ...right.filter((item) => !left.includes(item))];
  }
}

module.exports = { OrderPlan };
